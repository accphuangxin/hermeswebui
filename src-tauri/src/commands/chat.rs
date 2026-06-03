#![allow(non_snake_case)]

use std::time::Duration;
use tauri::{ipc::Channel, State};

use crate::database::{ChatMessage, ChatMessageInput, ChatSession};
use crate::hermes_config;
use crate::store::AppState;

use serde::{Deserialize, Serialize};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesChatStatus {
    pub online: bool,
    pub port: u16,
    pub host: String,
    pub base_url: String,
    pub default_model: Option<String>,
    pub provider: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesChatModel {
    pub id: String,
    pub provider: String,
    pub context_length: Option<u64>,
    pub is_default: bool,
}

// ============================================================================
// Session CRUD
// ============================================================================

#[tauri::command]
pub fn createChatSession(
    state: State<'_, AppState>,
    id: String,
    title: Option<String>,
    model: Option<String>,
    systemPrompt: Option<String>,
    projectDir: Option<String>,
    agentId: Option<String>,
) -> Result<ChatSession, String> {
    state
        .db
        .create_chat_session(
            &id,
            title.as_deref(),
            model.as_deref(),
            systemPrompt.as_deref(),
            projectDir.as_deref(),
            agentId.as_deref(),
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn listChatSessions(state: State<'_, AppState>, agentId: Option<String>) -> Result<Vec<ChatSession>, String> {
    state.db.list_chat_sessions(agentId.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn getChatSession(
    state: State<'_, AppState>,
    sessionId: String,
) -> Result<Option<ChatSession>, String> {
    state
        .db
        .get_chat_session(&sessionId)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn updateChatSession(
    state: State<'_, AppState>,
    sessionId: String,
    title: Option<String>,
    model: Option<String>,
    systemPrompt: Option<String>,
) -> Result<bool, String> {
    state
        .db
        .update_chat_session(
            &sessionId,
            title.as_deref(),
            model.as_deref(),
            systemPrompt.as_deref(),
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn deleteChatSession(state: State<'_, AppState>, sessionId: String) -> Result<bool, String> {
    state
        .db
        .delete_chat_session(&sessionId)
        .map_err(|e| e.to_string())
}

// ============================================================================
// Message Persistence
// ============================================================================

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveMessageInput {
    pub id: String,
    #[serde(flatten)]
    pub input: ChatMessageInput,
}

#[tauri::command]
pub fn saveChatMessage(
    state: State<'_, AppState>,
    sessionId: String,
    message: SaveMessageInput,
) -> Result<ChatMessage, String> {
    state
        .db
        .insert_chat_message(&sessionId, &message.id, &message.input)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn saveChatMessagesBatch(
    state: State<'_, AppState>,
    sessionId: String,
    messages: Vec<SaveMessageInput>,
) -> Result<Vec<ChatMessage>, String> {
    let batch: Vec<(String, ChatMessageInput)> = messages
        .into_iter()
        .map(|m| (m.id, m.input))
        .collect();
    state
        .db
        .insert_chat_messages_batch(&sessionId, &batch)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn getChatMessages(
    state: State<'_, AppState>,
    sessionId: String,
) -> Result<Vec<ChatMessage>, String> {
    state
        .db
        .get_chat_messages(&sessionId)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn deleteChatMessage(state: State<'_, AppState>, messageId: String) -> Result<bool, String> {
    state
        .db
        .delete_chat_message(&messageId)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clearChatMessages(state: State<'_, AppState>, sessionId: String) -> Result<u64, String> {
    state
        .db
        .clear_chat_messages(&sessionId)
        .map_err(|e| e.to_string())
}

// ============================================================================
// Hermes Chat Status & Models
// ============================================================================

pub(crate) struct ApiServerConfig {
    pub host: String,
    pub port: u16,
    /// `platforms.api_server.key` — empty string means no auth required
    pub key: String,
}

fn read_hermes_env_key() -> String {
    read_hermes_env_var("API_SERVER_KEY").unwrap_or_default()
}

/// Returns the .env path for the currently active agent profile (or the default hermes dir).
fn active_env_path() -> std::path::PathBuf {
    let hermes_dir = hermes_config::get_hermes_dir();
    if let Some(agent_id) = crate::store::get_active_hermes_agent() {
        hermes_dir.join("profiles").join(agent_id).join(".env")
    } else {
        hermes_dir.join(".env")
    }
}

fn read_hermes_env_var(key: &str) -> Option<String> {
    read_env_var_from(&hermes_config::get_hermes_dir().join(".env"), key)
}

fn read_env_var_from(env_path: &std::path::Path, key: &str) -> Option<String> {
    let content = std::fs::read_to_string(env_path).ok()?;
    let prefix = format!("{key}=");
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with('#') || line.is_empty() {
            continue;
        }
        if let Some(val) = line.strip_prefix(&prefix) {
            let val = val.trim().trim_matches('"').trim_matches('\'');
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}

fn write_hermes_env_vars(updates: &[(&str, Option<&str>)]) -> Result<(), String> {
    let env_path = hermes_config::get_hermes_dir().join(".env");
    write_env_vars_to(&env_path, updates)
}

fn write_env_vars_to(env_path: &std::path::Path, updates: &[(&str, Option<&str>)]) -> Result<(), String> {
    let existing = std::fs::read_to_string(&env_path).unwrap_or_default();
    let keys_to_remove: std::collections::HashSet<String> =
        updates.iter().map(|(k, _)| format!("{k}=")).collect();
    let mut lines: Vec<String> = existing
        .lines()
        .filter(|l| {
            let t = l.trim_start();
            !keys_to_remove.iter().any(|k| t.starts_with(k.as_str()))
        })
        .map(str::to_string)
        .collect();
    for (key, val) in updates {
        if let Some(v) = val {
            if !v.is_empty() {
                lines.push(format!("{key}={v}"));
            }
        }
    }
    let mut content = lines.join("\n");
    if !content.is_empty() {
        content.push('\n');
    }
    if let Some(parent) = env_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&env_path, content).map_err(|e| e.to_string())
}

/// Read the current API_SERVER_KEY from ~/.hermes/.env
#[tauri::command]
pub fn getHermesApiServerKey() -> String {
    read_hermes_env_key()
}

/// Write (or clear) API_SERVER_KEY in ~/.hermes/.env, preserving all other lines.
#[tauri::command]
pub fn setHermesApiServerKey(key: String) -> Result<(), String> {
    let val = if key.is_empty() { None } else { Some(key.as_str()) };
    write_hermes_env_vars(&[("API_SERVER_KEY", val)])
}

#[derive(serde::Serialize)]
pub struct HermesApiServerConfig {
    pub host: String,
    pub port: u16,
    pub key: String,
}

/// Get the effective API server connection config (host/port/key).
/// Reads from the active agent's profile .env if one is selected.
#[tauri::command]
pub fn getHermesApiServerConfig() -> HermesApiServerConfig {
    let env_path = active_env_path();
    // Port: profile .env → default .env → config.yaml → hardcoded default
    let port = read_env_var_from(&env_path, "HERMES_CLIENT_PORT")
        .or_else(|| read_hermes_env_var("HERMES_CLIENT_PORT"))
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or_else(|| {
            let cfg = read_api_server_config();
            cfg.port
        });
    // Host: same cascade
    let host = read_env_var_from(&env_path, "HERMES_CLIENT_HOST")
        .or_else(|| read_hermes_env_var("HERMES_CLIENT_HOST"))
        .unwrap_or_else(|| {
            let cfg = read_api_server_config();
            cfg.host
        });
    // Key: profile .env takes precedence, then fall back to default .env / config
    let key = read_env_var_from(&env_path, "API_SERVER_KEY")
        .or_else(|| read_hermes_env_var("API_SERVER_KEY"))
        .unwrap_or_default();
    HermesApiServerConfig { host, port, key }
}

/// Persist host/port/key overrides to the active agent profile .env (or default ~/.hermes/.env).
/// Pass empty string to clear a value (revert to config.yaml default).
#[tauri::command]
pub fn setHermesApiServerConfig(host: String, port: String, key: String) -> Result<(), String> {
    let env_path = active_env_path();
    write_env_vars_to(&env_path, &[
        ("HERMES_CLIENT_HOST", if host.is_empty() { None } else { Some(host.as_str()) }),
        ("HERMES_CLIENT_PORT", if port.is_empty() { None } else { Some(port.as_str()) }),
        ("API_SERVER_KEY",     if key.is_empty()  { None } else { Some(key.as_str()) }),
    ])
}

pub(crate) fn read_api_server_config() -> ApiServerConfig {
    let config = hermes_config::read_hermes_config().unwrap_or_default();
    let platforms = config.get("platforms");
    let api_server = platforms.and_then(|p| p.get("api_server"));
    let extra = api_server.and_then(|a| a.get("extra"));

    // Profile .env takes priority over the global ~/.hermes/.env
    let profile_env = active_env_path();

    // Read client-specific override first, then fall back to config.yaml extra.host
    let host = read_env_var_from(&profile_env, "HERMES_CLIENT_HOST")
        .or_else(|| read_hermes_env_var("HERMES_CLIENT_HOST"))
        .or_else(|| extra.and_then(|e| e.get("host")).and_then(|v| v.as_str()).map(str::to_string))
        .unwrap_or_else(|| "127.0.0.1".to_string());

    let port = read_env_var_from(&profile_env, "HERMES_CLIENT_PORT")
        .or_else(|| read_hermes_env_var("HERMES_CLIENT_PORT"))
        .and_then(|v| v.parse::<u16>().ok())
        .or_else(|| extra.and_then(|e| e.get("port")).and_then(|v| v.as_u64()).map(|p| p as u16))
        .unwrap_or(8643);

    // Key resolution order:
    //   1. profile .env API_SERVER_KEY  (active agent override)
    //   2. platforms.api_server.extra.key  (runtime injection)
    //   3. platforms.api_server.key        (config.yaml top-level field)
    //   4. API_SERVER_KEY in ~/.hermes/.env
    let key = read_env_var_from(&profile_env, "API_SERVER_KEY")
        .filter(|s| !s.is_empty())
        .or_else(|| extra.and_then(|e| e.get("key")).and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(str::to_string))
        .or_else(|| api_server.and_then(|a| a.get("key")).and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(str::to_string))
        .unwrap_or_else(read_hermes_env_key);

    ApiServerConfig { host, port, key }
}

pub(crate) fn build_api_client(timeout_secs: u64) -> Result<(reqwest::Client, String, String), String> {
    let cfg = read_api_server_config();
    let base_url = format!("http://{}:{}", cfg.host, cfg.port);
    let auth_header = if cfg.key.is_empty() {
        String::new()
    } else {
        format!("Bearer {}", cfg.key)
    };
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .no_proxy()
        .build()
        .map_err(|e| format!("failed to build client: {e}"))?;
    Ok((client, base_url, auth_header))
}

/// Build a client for SSE streaming — only limits connection establishment,
/// no overall timeout so long-running agent runs are never cut off mid-stream.
pub(crate) fn build_stream_client() -> Result<(reqwest::Client, String, String), String> {
    let cfg = read_api_server_config();
    let base_url = format!("http://{}:{}", cfg.host, cfg.port);
    let auth_header = if cfg.key.is_empty() {
        String::new()
    } else {
        format!("Bearer {}", cfg.key)
    };
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10)) // only limit connection setup
        .no_proxy()
        .build()
        .map_err(|e| format!("failed to build stream client: {e}"))?;
    Ok((client, base_url, auth_header))
}

#[tauri::command]
pub async fn getHermesChatStatus() -> Result<HermesChatStatus, String> {
    let cfg = read_api_server_config();
    let host = cfg.host.clone();
    let port = cfg.port;
    let base_url = format!("http://{}:{}", cfg.host, cfg.port);
    let probe_url = format!("{base_url}/v1/models");

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(3000))
        .no_proxy()
        .build()
        .map_err(|e| format!("failed to build probe client: {e}"))?;

    let mut req = client.get(&probe_url);
    if !cfg.key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", cfg.key));
    }
    let online = req.send().await.is_ok();

    let model_config = hermes_config::get_model_config().ok().flatten();
    let default_model = model_config.as_ref().and_then(|m| m.default.clone());
    let provider = model_config.as_ref().and_then(|m| m.provider.clone());

    Ok(HermesChatStatus {
        online,
        port,
        host,
        base_url,
        default_model,
        provider,
    })
}

/// Fetch the model list from a provider's /v1/models endpoint.
/// Returns (id, owned_by) pairs on success, empty vec on any failure (non-fatal).
async fn fetch_remote_models(base_url: &str, api_key: &str) -> Vec<(String, String, Option<u64>)> {
    let url = format!("{}/v1/models", base_url.trim_end_matches('/'));
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .no_proxy()
        .build()
    {
        Ok(c) => c,
        Err(_) => return vec![],
    };
    let mut req = client.get(&url);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {api_key}"));
    }
    let resp = match req.send().await {
        Ok(r) if r.status().is_success() => r,
        _ => return vec![],
    };
    let json: serde_json::Value = match resp.json().await {
        Ok(v) => v,
        Err(_) => return vec![],
    };
    json.get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| {
                    let id = m.get("id").and_then(|v| v.as_str())?.to_string();
                    let owned_by = m
                        .get("owned_by")
                        .and_then(|v| v.as_str())
                        .unwrap_or("api_server")
                        .to_string();
                    let context_window = m.get("context_window").and_then(|v| v.as_u64());
                    Some((id, owned_by, context_window))
                })
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub async fn getHermesChatModels() -> Result<Vec<HermesChatModel>, String> {
    let api_cfg = read_api_server_config();
    let api_base = format!("http://{}:{}", api_cfg.host, api_cfg.port);

    let model_config = hermes_config::get_model_config().ok().flatten();
    let default_model = model_config.as_ref().and_then(|m| m.default.as_deref()).unwrap_or("");
    let default_provider = model_config.as_ref().and_then(|m| m.provider.as_deref()).unwrap_or("");

    let remote_models = fetch_remote_models(&api_base, &api_cfg.key).await;

    let mut models: Vec<HermesChatModel> = remote_models
        .into_iter()
        .map(|(id, owned_by, context_window)| {
            let is_default = id == default_model && owned_by == default_provider;
            HermesChatModel { id, provider: owned_by, context_length: context_window, is_default }
        })
        .collect();

    // Default first, then alphabetically
    models.sort_by(|a, b| b.is_default.cmp(&a.is_default).then(a.id.cmp(&b.id)));

    Ok(models)
}

/// Switch the active Hermes model by updating model.default and model.provider
/// in config.yaml. Returns the applied model id so the frontend can confirm.
#[tauri::command]
pub fn switchHermesModel(modelId: String, providerId: String) -> Result<String, String> {
    let current = hermes_config::get_model_config()
        .map_err(|e| e.to_string())?
        .unwrap_or_default();

    let updated = hermes_config::HermesModelConfig {
        default: Some(modelId.clone()),
        provider: Some(providerId),
        ..current
    };

    hermes_config::set_model_config(&updated).map_err(|e| e.to_string())?;
    Ok(modelId)
}

// ============================================================================
// Runs API — Streaming via Tauri Channel
// ============================================================================

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum RunStreamEvent {
    Delta { content: String },
    ToolStarted { tool: String, preview: String },
    ToolCompleted { tool: String, duration: f64, error: bool },
    ApprovalRequired { tool: String, args: String },
    Completed { output: String, run_id: String, session_id: String, input_tokens: i64, output_tokens: i64, model: String },
    Failed { error: String },
    Error { message: String },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRequest {
    pub input: String,
    pub model: Option<String>,
    pub session_id: Option<String>,
    pub agent_id: Option<String>,
    pub api_server_port: Option<u16>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HermesAgent {
    pub id: String,
    /// Display name — fall back to `alias` then `id` if absent
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub alias: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub is_default: Option<bool>,
    #[serde(default)]
    pub gateway_running: Option<bool>,
    #[serde(default)]
    pub skill_count: Option<u32>,
    #[serde(default)]
    pub skills: Option<Vec<String>>,
    #[serde(default)]
    pub api_server_port: Option<u16>,
    #[serde(default)]
    pub api_server_key: Option<String>,
}

/// Set the globally active Hermes agent.
/// Pass None to revert to the default ~/.hermes/skills path.
#[tauri::command]
pub fn setActiveHermesAgent(agent_id: Option<String>) {
    // Treat "default" as no active agent (use ~/.hermes/.env)
    let normalized = agent_id.filter(|id| !id.is_empty() && id != "default");
    crate::store::set_active_hermes_agent(normalized);
}

/// Get the current Hermes skills path based on the active agent.
#[tauri::command]
pub fn getHermesSkillsPath() -> String {
    let hermes_dir = crate::hermes_config::get_hermes_dir();
    let path = if let Some(agent_id) = crate::store::get_active_hermes_agent() {
        hermes_dir.join("profiles").join(agent_id).join("skills")
    } else {
        hermes_dir.join("skills")
    };
    path.to_string_lossy().into_owned()
}

#[tauri::command]
pub async fn getHermesAgents() -> Result<Vec<HermesAgent>, String> {
    let (client, base, auth_header) = build_api_client(5)?;
    let url = format!("{base}/api/agents");

    let mut req = client.get(&url);
    if !auth_header.is_empty() {
        req = req.header("Authorization", &auth_header);
    }

    let resp = req.send().await.map_err(|e| format!("request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| format!("parse failed: {e}"))?;

    // Support both array response and wrapped {"agents": [...]} / {"data": [...]}
    let arr = if body.is_array() {
        body
    } else if let Some(v) = body.get("agents").or_else(|| body.get("data")).or_else(|| body.get("items")) {
        v.clone()
    } else {
        return Err(format!("unexpected response shape: {body}"));
    };

    serde_json::from_value::<Vec<HermesAgent>>(arr).map_err(|e| format!("deserialize failed: {e}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunCreated {
    pub run_id: String,
}

#[tauri::command]
pub async fn startChatRun(
    state: State<'_, AppState>,
    request: RunRequest,
    on_event: Channel<RunStreamEvent>,
) -> Result<RunCreated, String> {
    use futures::StreamExt;

    let (client, mut base, auth_header) = build_api_client(300)?;
    if let Some(port) = request.api_server_port {
        let cfg = read_api_server_config();
        base = format!("http://{}:{}", cfg.host, port);
    }
    let url = format!("{base}/v1/runs");

    let mut body = serde_json::json!({ "input": request.input });
    if let Some(model) = &request.model {
        body["model"] = serde_json::json!(model);
    }
    if let Some(sid) = &request.session_id {
        body["session_id"] = serde_json::json!(sid);
    }
    if let Some(agent_id) = &request.agent_id {
        body["agent_id"] = serde_json::json!(agent_id);
    }

    // POST /v1/runs — create run
    let mut req = client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body.to_string());
    if !auth_header.is_empty() {
        req = req.header("Authorization", &auth_header);
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("create run failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }

    let create_resp: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("parse response failed: {e}"))?;

    let run_id = create_resp["run_id"]
        .as_str()
        .ok_or("missing run_id")?
        .to_string();

    // GET /v1/runs/{run_id}/events — SSE stream (no overall timeout)
    let (stream_client, _, stream_auth) = build_stream_client()?;
    let events_url = format!("{base}/v1/runs/{run_id}/events");
    let mut events_req = stream_client.get(&events_url);
    if !stream_auth.is_empty() {
        events_req = events_req.header("Authorization", &stream_auth);
    }
    let events_resp = events_req
        .send()
        .await
        .map_err(|e| format!("subscribe events failed: {e}"))?;

    if !events_resp.status().is_success() {
        let text = events_resp.text().await.unwrap_or_default();
        return Err(format!("events subscribe failed: {text}"));
    }

    let run_id_clone = run_id.clone();
    let db = state.db.clone();
    let log_model = request.model.clone().unwrap_or_default();
    let log_provider = hermes_config::get_model_config()
        .ok()
        .flatten()
        .and_then(|m| m.provider)
        .unwrap_or_default();
    let started_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    tauri::async_runtime::spawn(async move {
        let mut stream = events_resp.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk) = stream.next().await {
            let chunk = match chunk {
                Ok(c) => c,
                Err(e) => {
                    let _ = on_event.send(RunStreamEvent::Error {
                        message: format!("stream error: {e}"),
                    });
                    return;
                }
            };

            buffer.push_str(&String::from_utf8_lossy(&chunk));
            let lines: Vec<&str> = buffer.split('\n').collect();
            let last = lines.last().copied().unwrap_or("");
            let complete_lines = &lines[..lines.len() - 1];

            for line in complete_lines {
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with(": ") || trimmed == ":" {
                    continue;
                }
                if !trimmed.starts_with("data: ") {
                    continue;
                }
                let json_str = &trimmed[6..];
                let Ok(json) = serde_json::from_str::<serde_json::Value>(json_str) else {
                    continue;
                };

                let event_type = json["event"].as_str().unwrap_or("");
                match event_type {
                    "message.delta" => {
                        if let Some(delta) = json["delta"].as_str() {
                            let _ = on_event.send(RunStreamEvent::Delta {
                                content: delta.to_string(),
                            });
                        }
                    }
                    "tool.started" => {
                        let tool = json["tool"].as_str().unwrap_or("").to_string();
                        let preview = json["preview"].as_str().unwrap_or("").to_string();
                        let _ = on_event.send(RunStreamEvent::ToolStarted { tool, preview });
                    }
                    "tool.completed" => {
                        let tool = json["tool"].as_str().unwrap_or("").to_string();
                        let duration = json["duration"].as_f64().unwrap_or(0.0);
                        let error = json["error"].as_bool().unwrap_or(false);
                        let _ = on_event.send(RunStreamEvent::ToolCompleted {
                            tool,
                            duration,
                            error,
                        });
                    }
                    "approval.required" => {
                        let tool = json["tool"].as_str().unwrap_or("").to_string();
                        let args = json["args"].to_string();
                        let _ = on_event.send(RunStreamEvent::ApprovalRequired { tool, args });
                    }
                    "run.completed" => {
                        let output = json["output"].as_str().unwrap_or("").to_string();
                        let session_id =
                            json["session_id"].as_str().unwrap_or("").to_string();
                        let input_tokens = json["usage"]["input_tokens"].as_i64().unwrap_or(0);
                        let output_tokens = json["usage"]["output_tokens"].as_i64().unwrap_or(0);
                        let completed_model = json["model"].as_str().unwrap_or(&log_model).to_string();

                        // Notify frontend first — DB write must not delay the response
                        let _ = on_event.send(RunStreamEvent::Completed {
                            output,
                            run_id: run_id_clone.clone(),
                            session_id,
                            input_tokens,
                            output_tokens,
                            model: completed_model,
                        });
                        if input_tokens > 0 || output_tokens > 0 {
                            let req_id = format!("hermes-{}", run_id_clone);
                            let model = if log_model.is_empty() { "unknown".to_string() } else { log_model.clone() };
                            let provider = if log_provider.is_empty() { "hermes".to_string() } else { log_provider.clone() };
                            let db_clone = db.clone();
                            tauri::async_runtime::spawn_blocking(move || {
                                if let Err(e) = db_clone.log_hermes_run(&req_id, &provider, &model, input_tokens, output_tokens, started_at) {
                                    log::warn!("Failed to log hermes run: {e}");
                                }
                            });
                        }
                        return;
                    }
                    "run.failed" => {
                        let error =
                            json["error"].as_str().unwrap_or("run failed").to_string();
                        let _ = on_event.send(RunStreamEvent::Failed { error });
                        return;
                    }
                    "run.stopped" => {
                        let session_id =
                            json["session_id"].as_str().unwrap_or("").to_string();
                        let _ = on_event.send(RunStreamEvent::Completed {
                            output: String::new(),
                            run_id: run_id_clone.clone(),
                            session_id,
                            input_tokens: 0,
                            output_tokens: 0,
                            model: String::new(),
                        });
                        return;
                    }
                    _ => {}
                }
            }

            buffer = last.to_string();
        }

        let _ = on_event.send(RunStreamEvent::Completed {
            output: String::new(),
            run_id: run_id_clone,
            session_id: String::new(),
            input_tokens: 0,
            output_tokens: 0,
            model: String::new(),
        });
    });

    Ok(RunCreated { run_id })
}

// GET /v1/runs/{run_id} — get run status
#[tauri::command]
pub async fn getChatRunStatus(runId: String) -> Result<serde_json::Value, String> {
    let (client, base, auth_header) = build_api_client(10)?;
    let url = format!("{base}/v1/runs/{runId}");

    let mut req = client.get(&url);
    if !auth_header.is_empty() {
        req = req.header("Authorization", &auth_header);
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("get run status failed: {e}"))?;

    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("get run status failed: {text}"));
    }

    resp.json()
        .await
        .map_err(|e| format!("parse run status failed: {e}"))
}

// POST /v1/runs/{run_id}/stop — stop run
#[tauri::command]
pub async fn stopChatRun(runId: String) -> Result<bool, String> {
    let (client, base, auth_header) = build_api_client(10)?;
    let url = format!("{base}/v1/runs/{runId}/stop");

    let mut req = client.post(&url);
    if !auth_header.is_empty() {
        req = req.header("Authorization", &auth_header);
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("stop request failed: {e}"))?;

    Ok(resp.status().is_success())
}

// POST /v1/runs/{run_id}/approval — approve/deny
#[tauri::command]
pub async fn approveChatRun(runId: String, approve: bool) -> Result<bool, String> {
    let (client, base, auth_header) = build_api_client(10)?;
    let url = format!("{base}/v1/runs/{runId}/approval");

    let body = serde_json::json!({ "approved": approve });

    let mut req = client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body.to_string());
    if !auth_header.is_empty() {
        req = req.header("Authorization", &auth_header);
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("approval request failed: {e}"))?;

    Ok(resp.status().is_success())
}

// ============================================================================
// File attachment
// ============================================================================

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatFileContent {
    pub filename: String,
    pub content: String,
    pub size_bytes: u64,
}

#[tauri::command]
pub fn readChatFile(path: String) -> Result<ChatFileContent, String> {
    let p = std::path::Path::new(&path);
    let filename = p
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    let meta = std::fs::metadata(&path).map_err(|e| format!("cannot read file: {e}"))?;
    let size_bytes = meta.len();

    if size_bytes > 50 * 1024 * 1024 {
        return Err("File too large (max 50MB)".to_string());
    }

    let ext = p
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let content = match ext.as_str() {
        "pdf" => extract_pdf(&path)?,
        "docx" => extract_docx(&path)?,
        "doc" => extract_doc_legacy(&path)?,
        "xlsx" | "xls" => extract_excel(&path)?,
        "pptx" => extract_pptx(&path)?,
        "ppt" => extract_ppt_legacy(&path)?,
        _ => std::fs::read_to_string(&path)
            .map_err(|e| format!("cannot read file as text: {e}"))?,
    };

    Ok(ChatFileContent {
        filename,
        content,
        size_bytes,
    })
}

fn extract_pdf(path: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("cannot read PDF: {e}"))?;
    pdf_extract::extract_text_from_mem(&bytes).map_err(|e| format!("PDF extraction failed: {e}"))
}

fn extract_docx(path: &str) -> Result<String, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("cannot open docx: {e}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("invalid docx archive: {e}"))?;

    let mut doc_xml = String::new();
    {
        let mut entry = archive
            .by_name("word/document.xml")
            .map_err(|_| "no word/document.xml found in docx".to_string())?;
        std::io::Read::read_to_string(&mut entry, &mut doc_xml)
            .map_err(|e| format!("read document.xml failed: {e}"))?;
    }

    Ok(strip_xml_tags(&doc_xml))
}

fn extract_excel(path: &str) -> Result<String, String> {
    use calamine::{open_workbook_auto, Data, Reader};

    let mut workbook =
        open_workbook_auto(path).map_err(|e| format!("cannot open spreadsheet: {e}"))?;

    let mut output = String::new();
    let sheet_names = workbook.sheet_names().to_vec();

    for name in sheet_names {
        if let Ok(range) = workbook.worksheet_range(&name) {
            output.push_str(&format!("## {name}\n\n"));
            for row in range.rows() {
                let cells: Vec<String> = row
                    .iter()
                    .map(|c| match c {
                        Data::Empty => String::new(),
                        Data::String(s) => s.clone(),
                        Data::Float(f) => f.to_string(),
                        Data::Int(i) => i.to_string(),
                        Data::Bool(b) => b.to_string(),
                        Data::Error(e) => format!("#ERR:{e:?}"),
                        _ => c.to_string(),
                    })
                    .collect();
                output.push_str(&format!("| {} |\n", cells.join(" | ")));
            }
            output.push('\n');
        }
    }

    Ok(output)
}

fn extract_pptx(path: &str) -> Result<String, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("cannot open pptx: {e}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("invalid pptx archive: {e}"))?;

    let mut output = String::new();
    let mut slide_index = 1;

    loop {
        let slide_path = format!("ppt/slides/slide{slide_index}.xml");
        let entry = archive.by_name(&slide_path);
        match entry {
            Ok(mut entry) => {
                let mut xml = String::new();
                std::io::Read::read_to_string(&mut entry, &mut xml)
                    .map_err(|e| format!("read slide failed: {e}"))?;
                let text = strip_xml_tags(&xml);
                if !text.trim().is_empty() {
                    output.push_str(&format!("--- Slide {slide_index} ---\n{text}\n\n"));
                }
                slide_index += 1;
            }
            Err(_) => break,
        }
    }

    if output.is_empty() {
        return Err("no slides found in pptx".to_string());
    }
    Ok(output)
}

fn extract_doc_legacy(path: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("cannot read doc: {e}"))?;
    Ok(extract_text_from_binary(&bytes))
}

fn extract_ppt_legacy(path: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("cannot read ppt: {e}"))?;
    Ok(extract_text_from_binary(&bytes))
}

fn extract_text_from_binary(bytes: &[u8]) -> String {
    // Try UTF-16LE (common in old Office formats)
    let mut text_parts: Vec<String> = Vec::new();
    let mut current = String::new();

    for chunk in bytes.chunks(2) {
        if chunk.len() == 2 {
            let ch = u16::from_le_bytes([chunk[0], chunk[1]]);
            if let Some(c) = char::from_u32(ch as u32) {
                if c.is_alphanumeric() || c.is_whitespace() || ".,;:!?()-/\"'、。，；：！？（）—\u{4e00}\u{9fff}".contains(c) || ('\u{4e00}'..='\u{9fff}').contains(&c) || ('\u{3000}'..='\u{303f}').contains(&c) || ('\u{ff00}'..='\u{ffef}').contains(&c) {
                    current.push(c);
                } else if !current.is_empty() {
                    if current.trim().len() >= 2 {
                        text_parts.push(current.trim().to_string());
                    }
                    current.clear();
                }
            }
        }
    }
    if current.trim().len() >= 2 {
        text_parts.push(current.trim().to_string());
    }

    let result = text_parts.join("\n");
    if result.len() > 100 {
        return result;
    }

    // Fallback: extract ASCII/UTF-8 readable strings
    let mut ascii_parts: Vec<String> = Vec::new();
    let mut current_ascii = String::new();
    for &b in bytes {
        if b >= 0x20 && b < 0x7f {
            current_ascii.push(b as char);
        } else if !current_ascii.is_empty() {
            if current_ascii.trim().len() >= 4 {
                ascii_parts.push(current_ascii.trim().to_string());
            }
            current_ascii.clear();
        }
    }
    if current_ascii.trim().len() >= 4 {
        ascii_parts.push(current_ascii.trim().to_string());
    }

    ascii_parts.join("\n")
}

fn strip_xml_tags(xml: &str) -> String {
    let mut result = String::with_capacity(xml.len() / 4);
    let mut in_tag = false;
    let mut last_was_newline = false;

    for ch in xml.chars() {
        if ch == '<' {
            in_tag = true;
            continue;
        }
        if ch == '>' {
            in_tag = false;
            if !last_was_newline && !result.is_empty() {
                result.push(' ');
            }
            continue;
        }
        if !in_tag {
            if ch == '\n' || ch == '\r' {
                if !last_was_newline {
                    result.push('\n');
                    last_was_newline = true;
                }
            } else {
                result.push(ch);
                last_was_newline = false;
            }
        }
    }

    result
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

/// Read a local image file and return it as a base64 data URL.
/// Only files under the user's home directory are allowed.
#[tauri::command]
pub fn read_local_image(path: String) -> Result<String, String> {
    use base64::Engine;

    let expanded = if path.starts_with("~/") {
        let home = dirs::home_dir().ok_or("cannot determine home dir")?;
        home.join(&path[2..])
    } else {
        std::path::PathBuf::from(&path)
    };

    // Security: must be under home dir
    let home = dirs::home_dir().ok_or("cannot determine home dir")?;
    if !expanded.starts_with(&home) {
        return Err("access denied: path outside home directory".to_string());
    }

    let bytes = std::fs::read(&expanded).map_err(|e| e.to_string())?;

    let ext = expanded
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        _ => "image/png",
    };

    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
}

/// Read a local HTML file and return its content as a string.
/// Only files under the user's home directory are allowed.
#[tauri::command]
pub fn read_local_html(path: String) -> Result<String, String> {
    let expanded = if path.starts_with("~/") {
        let home = dirs::home_dir().ok_or("cannot determine home dir")?;
        home.join(&path[2..])
    } else {
        std::path::PathBuf::from(&path)
    };

    let home = dirs::home_dir().ok_or("cannot determine home dir")?;
    if !expanded.starts_with(&home) {
        return Err("access denied: path outside home directory".to_string());
    }

    std::fs::read_to_string(&expanded).map_err(|e| e.to_string())
}
