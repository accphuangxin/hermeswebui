#![allow(non_snake_case)]

use crate::commands::chat::{build_api_client, read_api_server_config};
use serde::{Deserialize, Serialize};
use std::time::Duration;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CronJob {
    pub id: String,
    pub name: String,
    pub schedule: String,
    pub prompt: String,
    pub enabled: bool,
    pub model: Option<String>,
    pub last_run: Option<String>,
    pub next_run: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
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
// Helpers
// ============================================================================

fn hermes_web_url() -> String {
    let port = std::env::var("HERMES_WEB_PORT")
        .ok()
        .and_then(|v| v.trim().parse::<u16>().ok())
        .unwrap_or(9119);
    format!("http://127.0.0.1:{port}")
}

fn build_web_client(timeout_secs: u64) -> Result<(reqwest::Client, String), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .no_proxy()
        .build()
        .map_err(|e| format!("failed to build client: {e}"))?;
    Ok((client, hermes_web_url()))
}

/// Build Authorization header value for the Hermes web server session token.
/// The session token is embedded in the served HTML at startup; we can't
/// access it from outside the process, so cron API calls use the same
/// API_SERVER_KEY that the api_server platform uses (both run in the same
/// Hermes process and share the same auth config).
fn web_auth_header() -> String {
    // Reuse the api_server key resolution — both servers are in the same process
    let cfg = read_api_server_config();
    if cfg.key.is_empty() {
        String::new()
    } else {
        format!("Bearer {}", cfg.key)
    }
}

async fn get_json(url: &str, auth: &str) -> Result<serde_json::Value, String> {
    let (client, _) = build_web_client(10)?;
    let mut req = client.get(url);
    if !auth.is_empty() {
        req = req.header("Authorization", auth);
    }
    let resp = req.send().await.map_err(|e| format!("request failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }
    resp.json().await.map_err(|e| format!("parse failed: {e}"))
}

async fn post_json(url: &str, auth: &str, body: serde_json::Value) -> Result<serde_json::Value, String> {
    let (client, _) = build_web_client(10)?;
    let mut req = client.post(url).header("Content-Type", "application/json").body(body.to_string());
    if !auth.is_empty() {
        req = req.header("Authorization", auth);
    }
    let resp = req.send().await.map_err(|e| format!("request failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }
    resp.json().await.map_err(|e| format!("parse failed: {e}"))
}

async fn patch_json(url: &str, auth: &str, body: serde_json::Value) -> Result<serde_json::Value, String> {
    let (client, _) = build_web_client(10)?;
    let mut req = client.patch(url).header("Content-Type", "application/json").body(body.to_string());
    if !auth.is_empty() {
        req = req.header("Authorization", auth);
    }
    let resp = req.send().await.map_err(|e| format!("request failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }
    resp.json().await.map_err(|e| format!("parse failed: {e}"))
}

async fn delete_req(url: &str, auth: &str) -> Result<(), String> {
    let (client, _) = build_web_client(10)?;
    let mut req = client.delete(url);
    if !auth.is_empty() {
        req = req.header("Authorization", auth);
    }
    let resp = req.send().await.map_err(|e| format!("request failed: {e}"))?;
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

#[tauri::command]
pub async fn listCronJobs(includeDisabled: Option<bool>) -> Result<Vec<serde_json::Value>, String> {
    let auth = web_auth_header();
    let base = hermes_web_url();
    let url = if includeDisabled.unwrap_or(false) {
        format!("{base}/api/jobs?include_disabled=true")
    } else {
        format!("{base}/api/jobs")
    };
    let val = get_json(&url, &auth).await?;
    let jobs = val.as_array().cloned().unwrap_or_default();
    Ok(jobs)
}

#[tauri::command]
pub async fn getCronJob(jobId: String) -> Result<serde_json::Value, String> {
    let auth = web_auth_header();
    let base = hermes_web_url();
    let url = format!("{base}/api/jobs/{jobId}");
    get_json(&url, &auth).await
}

#[tauri::command]
pub async fn createCronJob(job: CreateCronJobRequest) -> Result<serde_json::Value, String> {
    let auth = web_auth_header();
    let base = hermes_web_url();
    let url = format!("{base}/api/jobs");
    let body = serde_json::json!({
        "name": job.name,
        "schedule": job.schedule,
        "prompt": job.prompt,
        "enabled": job.enabled.unwrap_or(true),
        "model": job.model,
    });
    post_json(&url, &auth, body).await
}

#[tauri::command]
pub async fn updateCronJob(jobId: String, job: UpdateCronJobRequest) -> Result<serde_json::Value, String> {
    let auth = web_auth_header();
    let base = hermes_web_url();
    let url = format!("{base}/api/jobs/{jobId}");
    let mut body = serde_json::Map::new();
    if let Some(v) = job.name { body.insert("name".into(), serde_json::json!(v)); }
    if let Some(v) = job.schedule { body.insert("schedule".into(), serde_json::json!(v)); }
    if let Some(v) = job.prompt { body.insert("prompt".into(), serde_json::json!(v)); }
    if let Some(v) = job.enabled { body.insert("enabled".into(), serde_json::json!(v)); }
    if let Some(v) = job.model { body.insert("model".into(), serde_json::json!(v)); }
    patch_json(&url, &auth, serde_json::Value::Object(body)).await
}

#[tauri::command]
pub async fn deleteCronJob(jobId: String) -> Result<(), String> {
    let auth = web_auth_header();
    let base = hermes_web_url();
    let url = format!("{base}/api/jobs/{jobId}");
    delete_req(&url, &auth).await
}

/// Trigger a cron job immediately by creating a /v1/runs with its prompt
#[tauri::command]
pub async fn triggerCronJob(jobId: String) -> Result<serde_json::Value, String> {
    // Fetch job details first
    let auth = web_auth_header();
    let base = hermes_web_url();
    let url = format!("{base}/api/jobs/{jobId}");
    let job = get_json(&url, &auth).await?;

    let prompt = job["prompt"].as_str().unwrap_or("").to_string();
    let model = job["model"].as_str().map(str::to_string);
    if prompt.is_empty() {
        return Err("job has no prompt".to_string());
    }

    // Post to api_server /v1/runs
    let (client, api_base, api_auth) = build_api_client(30)?;
    let runs_url = format!("{api_base}/v1/runs");
    let mut body = serde_json::json!({ "input": prompt });
    if let Some(m) = model {
        body["model"] = serde_json::json!(m);
    }
    let mut req = client.post(&runs_url).header("Content-Type", "application/json").body(body.to_string());
    if !api_auth.is_empty() {
        req = req.header("Authorization", &api_auth);
    }
    let resp = req.send().await.map_err(|e| format!("trigger failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }
    resp.json().await.map_err(|e| format!("parse failed: {e}"))
}
