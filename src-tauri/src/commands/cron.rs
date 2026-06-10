#![allow(non_snake_case)]

use crate::commands::chat::{build_api_client, read_api_server_config};
use serde::{Deserialize, Serialize};
use std::time::Duration;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCronJobRequest {
    pub name: String,
    pub schedule: String,
    pub prompt: String,
    pub enabled: Option<bool>,
    pub model: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateCronJobRequest {
    pub name: Option<String>,
    pub schedule: Option<String>,
    pub prompt: Option<String>,
    pub enabled: Option<bool>,
    pub model: Option<String>,
}

// ============================================================================
// Helpers — all cron API lives on the same api_server (port 8643)
// ============================================================================

fn cron_base_url() -> String {
    let cfg = read_api_server_config();
    format!("http://{}:{}", cfg.host, cfg.port)
}

fn cron_auth_header() -> String {
    let cfg = read_api_server_config();
    if cfg.key.is_empty() {
        String::new()
    } else {
        format!("Bearer {}", cfg.key)
    }
}

fn cron_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .no_proxy()
        .build()
        .map_err(|e| format!("failed to build client: {e}"))
}

async fn cron_get(url: &str) -> Result<serde_json::Value, String> {
    let client = cron_client(10)?;
    let auth = cron_auth_header();
    let mut req = client.get(url);
    if !auth.is_empty() {
        req = req.header("Authorization", &auth);
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }
    resp.json().await.map_err(|e| format!("parse failed: {e}"))
}

async fn cron_post(url: &str, body: serde_json::Value) -> Result<serde_json::Value, String> {
    let client = cron_client(10)?;
    let auth = cron_auth_header();
    let mut req = client
        .post(url)
        .header("Content-Type", "application/json")
        .body(body.to_string());
    if !auth.is_empty() {
        req = req.header("Authorization", &auth);
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }
    resp.json().await.map_err(|e| format!("parse failed: {e}"))
}

async fn cron_patch(url: &str, body: serde_json::Value) -> Result<serde_json::Value, String> {
    let client = cron_client(10)?;
    let auth = cron_auth_header();
    let mut req = client
        .patch(url)
        .header("Content-Type", "application/json")
        .body(body.to_string());
    if !auth.is_empty() {
        req = req.header("Authorization", &auth);
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }
    resp.json().await.map_err(|e| format!("parse failed: {e}"))
}

async fn cron_delete(url: &str) -> Result<(), String> {
    let client = cron_client(10)?;
    let auth = cron_auth_header();
    let mut req = client.delete(url);
    if !auth.is_empty() {
        req = req.header("Authorization", &auth);
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }
    Ok(())
}

// ============================================================================
// Commands
// ============================================================================

/// GET /api/jobs  →  {"jobs": [...]}
#[tauri::command]
pub async fn listCronJobs(includeDisabled: Option<bool>) -> Result<Vec<serde_json::Value>, String> {
    let base = cron_base_url();
    let url = if includeDisabled.unwrap_or(false) {
        format!("{base}/api/jobs?include_disabled=true")
    } else {
        format!("{base}/api/jobs")
    };
    let val = cron_get(&url).await?;
    // Response: {"jobs": [...]}
    let jobs = val
        .get("jobs")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(jobs)
}

/// GET /api/jobs/{id}  →  {"job": {...}}
#[tauri::command]
pub async fn getCronJob(jobId: String) -> Result<serde_json::Value, String> {
    let base = cron_base_url();
    let url = format!("{base}/api/jobs/{jobId}");
    let val = cron_get(&url).await?;
    val.get("job")
        .cloned()
        .ok_or_else(|| format!("unexpected response: {val}"))
}

/// POST /api/jobs  →  {"job": {...}}
#[tauri::command]
pub async fn createCronJob(job: CreateCronJobRequest) -> Result<serde_json::Value, String> {
    let base = cron_base_url();
    let url = format!("{base}/api/jobs");
    let body = serde_json::json!({
        "name": job.name,
        "schedule": job.schedule,
        "prompt": job.prompt,
        "enabled": job.enabled.unwrap_or(true),
        "model": job.model,
    });
    let val = cron_post(&url, body).await?;
    val.get("job")
        .cloned()
        .ok_or_else(|| format!("unexpected response: {val}"))
}

/// PATCH /api/jobs/{id}  →  {"job": {...}}
#[tauri::command]
pub async fn updateCronJob(
    jobId: String,
    job: UpdateCronJobRequest,
) -> Result<serde_json::Value, String> {
    let base = cron_base_url();
    let url = format!("{base}/api/jobs/{jobId}");
    let mut body = serde_json::Map::new();
    if let Some(v) = job.name {
        body.insert("name".into(), serde_json::json!(v));
    }
    if let Some(v) = job.schedule {
        body.insert("schedule".into(), serde_json::json!(v));
    }
    if let Some(v) = job.prompt {
        body.insert("prompt".into(), serde_json::json!(v));
    }
    if let Some(v) = job.enabled {
        body.insert("enabled".into(), serde_json::json!(v));
    }
    if let Some(v) = job.model {
        body.insert("model".into(), serde_json::json!(v));
    }
    let val = cron_patch(&url, serde_json::Value::Object(body)).await?;
    val.get("job")
        .cloned()
        .ok_or_else(|| format!("unexpected response: {val}"))
}

/// DELETE /api/jobs/{id}
#[tauri::command]
pub async fn deleteCronJob(jobId: String) -> Result<(), String> {
    let base = cron_base_url();
    let url = format!("{base}/api/jobs/{jobId}");
    cron_delete(&url).await
}

/// Trigger a cron job immediately via POST /v1/runs
#[tauri::command]
pub async fn triggerCronJob(jobId: String) -> Result<serde_json::Value, String> {
    let base = cron_base_url();
    let url = format!("{base}/api/jobs/{jobId}");
    let val = cron_get(&url).await?;
    let job = val
        .get("job")
        .ok_or_else(|| format!("unexpected response: {val}"))?;

    let prompt = job["prompt"].as_str().unwrap_or("").to_string();
    let model = job["model"].as_str().map(str::to_string);
    if prompt.is_empty() {
        return Err("job has no prompt".to_string());
    }

    let (client, api_base, api_auth) = build_api_client(30)?;
    let runs_url = format!("{api_base}/v1/runs");
    let mut body = serde_json::json!({ "input": prompt });
    if let Some(m) = model {
        body["model"] = serde_json::json!(m);
    }
    let mut req = client
        .post(&runs_url)
        .header("Content-Type", "application/json")
        .body(body.to_string());
    if !api_auth.is_empty() {
        req = req.header("Authorization", &api_auth);
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("trigger failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }
    resp.json().await.map_err(|e| format!("parse failed: {e}"))
}

// ============================================================================
// Cron output log commands
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct CronOutputEntry {
    pub filename: String,
    pub size: u64,
}

/// Resolve the cron output directory for the given job_id.
/// Prefers the active agent profile path; falls back to global.
fn cron_output_dir(job_id: &str) -> std::path::PathBuf {
    let hermes_dir = crate::hermes_config::get_hermes_dir();
    if let Some(agent_id) = crate::store::get_active_hermes_agent() {
        let agent_dir = hermes_dir
            .join("profiles")
            .join(agent_id)
            .join("cron")
            .join("output")
            .join(job_id);
        if agent_dir.exists() {
            return agent_dir;
        }
    }
    hermes_dir.join("cron").join("output").join(job_id)
}

/// List output log files for a cron job
#[tauri::command]
pub fn list_cron_outputs(job_id: String) -> Result<Vec<CronOutputEntry>, String> {
    let dir = cron_output_dir(&job_id);

    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut entries: Vec<CronOutputEntry> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|e| {
            let path = e.path();
            if path.extension().and_then(|s| s.to_str()) != Some("md") {
                return None;
            }
            let filename = path.file_name()?.to_string_lossy().to_string();
            let size = path.metadata().ok()?.len();
            Some(CronOutputEntry { filename, size })
        })
        .collect();

    entries.sort_by(|a, b| b.filename.cmp(&a.filename));
    Ok(entries)
}

/// Read a single output log file for a cron job
#[tauri::command]
pub fn read_cron_output(job_id: String, filename: String) -> Result<String, String> {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("invalid filename".to_string());
    }
    let path = cron_output_dir(&job_id).join(&filename);
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}
