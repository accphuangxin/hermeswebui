#![allow(non_snake_case)]

use crate::commands::chat::read_api_server_config;
use serde::{Deserialize, Serialize};
use std::time::Duration;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KanbanBoard {
    pub slug: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateBoardInput {
    pub slug: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct KanbanTask {
    pub task_id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<i32>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
    #[serde(default)]
    pub parents: Vec<String>,
    #[serde(default)]
    pub children: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worker_pid: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_heartbeat: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_retries: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_count: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTaskInput {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTaskInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

// ============================================================================
// Helpers — Kanban API on port 8650
// ============================================================================

fn kanban_base_url() -> String {
    let cfg = read_api_server_config();
    // Kanban API runs on port 8650 (different from cron/chat on 8640)
    format!("http://{}:8650", cfg.host)
}

fn kanban_auth_header() -> String {
    let cfg = read_api_server_config();
    if cfg.key.is_empty() {
        String::new()
    } else {
        format!("Bearer {}", cfg.key)
    }
}

fn kanban_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .no_proxy()
        .build()
        .map_err(|e| format!("failed to build client: {e}"))
}

async fn kanban_get(path: &str) -> Result<serde_json::Value, String> {
    let url = format!("{}{}", kanban_base_url(), path);
    let client = kanban_client(10)?;
    let auth = kanban_auth_header();
    let mut req = client.get(&url);
    if !auth.is_empty() {
        req = req.header("Authorization", &auth);
    }
    let resp = req.send().await.map_err(|e| format!("request failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }
    resp.json().await.map_err(|e| format!("parse failed: {e}"))
}

async fn kanban_post(path: &str, body: serde_json::Value) -> Result<serde_json::Value, String> {
    let url = format!("{}{}", kanban_base_url(), path);
    let client = kanban_client(10)?;
    let auth = kanban_auth_header();
    let mut req = client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body.to_string());
    if !auth.is_empty() {
        req = req.header("Authorization", &auth);
    }
    let resp = req.send().await.map_err(|e| format!("request failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }
    resp.json().await.map_err(|e| format!("parse failed: {e}"))
}

async fn kanban_patch(path: &str, body: serde_json::Value) -> Result<serde_json::Value, String> {
    let url = format!("{}{}", kanban_base_url(), path);
    let client = kanban_client(10)?;
    let auth = kanban_auth_header();
    let mut req = client
        .patch(&url)
        .header("Content-Type", "application/json")
        .body(body.to_string());
    if !auth.is_empty() {
        req = req.header("Authorization", &auth);
    }
    let resp = req.send().await.map_err(|e| format!("request failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }
    resp.json().await.map_err(|e| format!("parse failed: {e}"))
}

async fn kanban_delete(path: &str) -> Result<(), String> {
    let url = format!("{}{}", kanban_base_url(), path);
    let client = kanban_client(10)?;
    let auth = kanban_auth_header();
    let mut req = client.delete(&url);
    if !auth.is_empty() {
        req = req.header("Authorization", &auth);
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
// Board Commands
// ============================================================================

/// GET /v1/boards
#[tauri::command]
pub async fn listKanbanBoards() -> Result<Vec<KanbanBoard>, String> {
    let val = kanban_get("/v1/boards").await?;
    serde_json::from_value(val).map_err(|e| format!("parse boards failed: {e}"))
}

/// POST /v1/boards
#[tauri::command]
pub async fn createKanbanBoard(input: CreateBoardInput) -> Result<KanbanBoard, String> {
    let body = serde_json::to_value(&input).map_err(|e| format!("serialize failed: {e}"))?;
    let val = kanban_post("/v1/boards", body).await?;
    serde_json::from_value(val).map_err(|e| format!("parse board failed: {e}"))
}

/// GET /v1/boards/{slug}
#[tauri::command]
pub async fn getKanbanBoard(slug: String) -> Result<KanbanBoard, String> {
    let path = format!("/v1/boards/{}", slug);
    let val = kanban_get(&path).await?;
    serde_json::from_value(val).map_err(|e| format!("parse board failed: {e}"))
}

// ============================================================================
// Task Commands
// ============================================================================

/// GET /v1/boards/{board}/tasks
#[tauri::command]
pub async fn listKanbanTasks(boardSlug: String) -> Result<Vec<KanbanTask>, String> {
    let path = format!("/v1/boards/{}/tasks", boardSlug);
    let val = kanban_get(&path).await?;
    serde_json::from_value(val).map_err(|e| format!("parse tasks failed: {e}"))
}

/// POST /v1/boards/{board}/tasks
#[tauri::command]
pub async fn createKanbanTask(
    boardSlug: String,
    input: CreateTaskInput,
) -> Result<KanbanTask, String> {
    let path = format!("/v1/boards/{}/tasks", boardSlug);
    let body = serde_json::to_value(&input).map_err(|e| format!("serialize failed: {e}"))?;
    let val = kanban_post(&path, body).await?;
    serde_json::from_value(val).map_err(|e| format!("parse task failed: {e}"))
}

/// PATCH /v1/boards/{board}/tasks/{task_id}
#[tauri::command]
pub async fn updateKanbanTask(
    boardSlug: String,
    taskId: String,
    input: UpdateTaskInput,
) -> Result<KanbanTask, String> {
    let path = format!("/v1/boards/{}/tasks/{}", boardSlug, taskId);
    let body = serde_json::to_value(&input).map_err(|e| format!("serialize failed: {e}"))?;
    let val = kanban_patch(&path, body).await?;
    serde_json::from_value(val).map_err(|e| format!("parse task failed: {e}"))
}

/// DELETE /v1/boards/{board}/tasks/{task_id}
#[tauri::command]
pub async fn deleteKanbanTask(boardSlug: String, taskId: String) -> Result<(), String> {
    let path = format!("/v1/boards/{}/tasks/{}", boardSlug, taskId);
    kanban_delete(&path).await
}

/// GET /v1/boards/{board}/tasks/{task_id}
#[tauri::command]
pub async fn getKanbanTask(boardSlug: String, taskId: String) -> Result<KanbanTask, String> {
    let path = format!("/v1/boards/{}/tasks/{}", boardSlug, taskId);
    let val = kanban_get(&path).await?;
    serde_json::from_value(val).map_err(|e| format!("parse task failed: {e}"))
}

// ============================================================================
// Dependency Commands
// ============================================================================

/// POST /v1/boards/{board}/tasks/{task_id}/link
#[tauri::command]
pub async fn linkKanbanTasks(
    boardSlug: String,
    parentId: String,
    childId: String,
) -> Result<(), String> {
    let path = format!("/v1/boards/{}/tasks/{}/link", boardSlug, childId);
    let body = serde_json::json!({ "parent_id": parentId });
    let _ = kanban_post(&path, body).await?;
    Ok(())
}

/// GET /v1/boards/{board}/tasks/{task_id}/parents
#[tauri::command]
pub async fn getTaskParents(boardSlug: String, taskId: String) -> Result<Vec<KanbanTask>, String> {
    let path = format!("/v1/boards/{}/tasks/{}/parents", boardSlug, taskId);
    let val = kanban_get(&path).await?;
    serde_json::from_value(val).map_err(|e| format!("parse parents failed: {e}"))
}

/// GET /v1/boards/{board}/tasks/{task_id}/children
#[tauri::command]
pub async fn getTaskChildren(
    boardSlug: String,
    taskId: String,
) -> Result<Vec<KanbanTask>, String> {
    let path = format!("/v1/boards/{}/tasks/{}/children", boardSlug, taskId);
    let val = kanban_get(&path).await?;
    serde_json::from_value(val).map_err(|e| format!("parse children failed: {e}"))
}
