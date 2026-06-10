#![allow(non_snake_case)]

use crate::commands::chat::read_api_server_config;
use serde::{Deserialize, Serialize};
use std::time::Duration;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskRef {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KanbanBoard {
    pub slug: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>, // 新 API 字段
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>, // 旧 API 字段（兼容）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived: Option<bool>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>, // 新 API 字段
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>, // 旧 API 字段（兼容）
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<i32>,
    pub created_at: serde_json::Value, // 支持数字或字符串
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parents: Option<Vec<TaskRef>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<TaskRef>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worker_pid: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_heartbeat: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_retries: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tenant: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub board: Option<String>,
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

async fn kanban_delete(path: &str) -> Result<(), String> {
    let url = format!("{}{}", kanban_base_url(), path);
    let client = kanban_client(10)?;
    let auth = kanban_auth_header();
    let mut req = client.delete(&url);
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
// Board Commands
// ============================================================================

/// GET /v1/boards
#[tauri::command]
pub async fn listKanbanBoards() -> Result<Vec<KanbanBoard>, String> {
    let val = kanban_get("/v1/boards").await?;
    // API 返回格式: {"boards": [...]}
    let boards = val
        .get("boards")
        .ok_or_else(|| "missing 'boards' field".to_string())?;
    serde_json::from_value(boards.clone()).map_err(|e| format!("parse boards failed: {e}"))
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

/// DELETE /v1/boards/{slug}
#[tauri::command]
pub async fn deleteKanbanBoard(slug: String) -> Result<(), String> {
    let path = format!("/v1/boards/{}", slug);
    kanban_delete(&path).await
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
///
/// API 只返回 {"task_id": "...", "board": "..."}，需要重新获取完整任务
#[tauri::command]
pub async fn createKanbanTask(
    boardSlug: String,
    input: CreateTaskInput,
) -> Result<KanbanTask, String> {
    let path = format!("/v1/boards/{}/tasks", boardSlug);
    let body = serde_json::to_value(&input).map_err(|e| format!("serialize failed: {e}"))?;
    let val = kanban_post(&path, body).await?;

    // 提取 task_id
    let task_id = val
        .get("task_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing task_id in response".to_string())?;

    // 重新获取完整任务数据
    let get_path = format!("/v1/boards/{}/tasks/{}", boardSlug, task_id);
    let task_val = kanban_get(&get_path).await?;
    serde_json::from_value(task_val).map_err(|e| format!("parse task failed: {e}"))
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

/// DELETE /v1/boards/{board}/tasks/{task_id}?hard=true
#[tauri::command]
pub async fn deleteKanbanTask(boardSlug: String, taskId: String) -> Result<(), String> {
    let path = format!("/v1/boards/{}/tasks/{}?hard=true", boardSlug, taskId);
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

/// DELETE /v1/boards/{board}/tasks/{task_id}/link
#[tauri::command]
pub async fn unlinkKanbanTasks(
    boardSlug: String,
    parentId: String,
    childId: String,
) -> Result<(), String> {
    let path = format!("/v1/boards/{}/tasks/{}/link", boardSlug, childId);
    let body = serde_json::json!({ "parent_id": parentId });

    let url = format!("{}{}", kanban_base_url(), path);
    let client = kanban_client(10)?;
    let auth = kanban_auth_header();
    let mut req = client
        .delete(&url)
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
    Ok(())
}

/// POST /v1/boards/{board}/tasks/{task_id}/reset
#[tauri::command]
pub async fn resetKanbanTask(
    boardSlug: String,
    taskId: String,
) -> Result<serde_json::Value, String> {
    let path = format!("/v1/boards/{}/tasks/{}/reset", boardSlug, taskId);
    let body = serde_json::json!({});
    let val = kanban_post(&path, body).await?;
    Ok(val)
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
pub async fn getTaskChildren(boardSlug: String, taskId: String) -> Result<Vec<KanbanTask>, String> {
    let path = format!("/v1/boards/{}/tasks/{}/children", boardSlug, taskId);
    let val = kanban_get(&path).await?;
    serde_json::from_value(val).map_err(|e| format!("parse children failed: {e}"))
}

/// POST /v1/boards/{board}/tasks/{task_id}/unblock
#[tauri::command]
pub async fn unblockKanbanTask(
    boardSlug: String,
    taskId: String,
) -> Result<serde_json::Value, String> {
    let path = format!("/v1/boards/{}/tasks/{}/unblock", boardSlug, taskId);
    let body = serde_json::json!({});
    kanban_post(&path, body).await
}

/// GET /v1/boards/{board}/tasks/{task_id}/events
#[tauri::command]
pub async fn getTaskEvents(
    boardSlug: String,
    taskId: String,
) -> Result<serde_json::Value, String> {
    let path = format!("/v1/boards/{}/tasks/{}/events?limit=50", boardSlug, taskId);
    kanban_get(&path).await
}

/// GET /v1/boards/{board}/tasks/{task_id}/runs
#[tauri::command]
pub async fn getTaskRuns(
    boardSlug: String,
    taskId: String,
) -> Result<serde_json::Value, String> {
    let path = format!("/v1/boards/{}/tasks/{}/runs", boardSlug, taskId);
    kanban_get(&path).await
}

/// GET /v1/boards/{board}/tasks/{task_id}/conversation
#[tauri::command]
pub async fn getTaskConversation(
    boardSlug: String,
    taskId: String,
) -> Result<serde_json::Value, String> {
    let path = format!("/v1/boards/{}/tasks/{}/conversation", boardSlug, taskId);
    kanban_get(&path).await
}

/// GET /v1/boards/{board}/tasks/{task_id}/thread-messages?roles=all
#[tauri::command]
pub async fn getTaskThreadMessages(
    boardSlug: String,
    taskId: String,
    roles: Option<String>,
) -> Result<serde_json::Value, String> {
    let roles_param = roles.as_deref().unwrap_or("all");
    let path = format!(
        "/v1/boards/{}/tasks/{}/thread-messages?roles={}",
        boardSlug, taskId, roles_param
    );
    kanban_get(&path).await
}

// ============================================================================
// Workflow Trigger
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerBoardInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tasks: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub once: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initial_prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerBoardResponse {
    pub message: String,
    pub board: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<String>,
    pub processed: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tasks: Option<Vec<serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub errors: Option<serde_json::Value>,
}

/// POST /v1/boards/{board}/trigger
#[tauri::command]
pub async fn triggerKanbanBoard(
    boardSlug: String,
    input: Option<TriggerBoardInput>,
) -> Result<TriggerBoardResponse, String> {
    let path = format!("/v1/boards/{}/trigger", boardSlug);
    let body = if let Some(inp) = input {
        serde_json::to_value(&inp).map_err(|e| format!("serialize failed: {e}"))?
    } else {
        serde_json::json!({})
    };
    let val = kanban_post(&path, body).await?;
    serde_json::from_value(val).map_err(|e| format!("parse trigger response failed: {e}"))
}

// ============================================================================
// Batch Operations
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchOperationResult {
    pub success_count: i32,
    pub failed_count: i32,
    pub errors: Vec<String>,
}

/// 批量删除任务
#[tauri::command]
pub async fn batchDeleteKanbanTasks(
    boardSlug: String,
    taskIds: Vec<String>,
) -> Result<BatchOperationResult, String> {
    let mut success_count = 0;
    let mut failed_count = 0;
    let mut errors = Vec::new();

    for task_id in taskIds {
        let path = format!("/v1/boards/{}/tasks/{}?hard=true", boardSlug, task_id);
        match kanban_delete(&path).await {
            Ok(_) => success_count += 1,
            Err(e) => {
                failed_count += 1;
                errors.push(format!("删除任务 {} 失败: {}", task_id, e));
            }
        }
    }

    Ok(BatchOperationResult {
        success_count,
        failed_count,
        errors,
    })
}

/// 批量重置任务
#[tauri::command]
pub async fn batchResetKanbanTasks(
    boardSlug: String,
    taskIds: Vec<String>,
) -> Result<BatchOperationResult, String> {
    let mut success_count = 0;
    let mut failed_count = 0;
    let mut errors = Vec::new();

    for task_id in taskIds {
        let path = format!("/v1/boards/{}/tasks/{}/reset", boardSlug, task_id);
        let body = serde_json::json!({});
        match kanban_post(&path, body).await {
            Ok(_) => success_count += 1,
            Err(e) => {
                failed_count += 1;
                errors.push(format!("重置任务 {} 失败: {}", task_id, e));
            }
        }
    }

    Ok(BatchOperationResult {
        success_count,
        failed_count,
        errors,
    })
}

/// 批量执行任务
#[tauri::command]
pub async fn batchExecuteKanbanTasks(
    boardSlug: String,
    taskIds: Vec<String>,
) -> Result<BatchOperationResult, String> {
    let mut success_count = 0;
    let mut failed_count = 0;
    let mut errors = Vec::new();

    for task_id in taskIds {
        let path = format!("/v1/boards/{}/trigger", boardSlug);
        let body = serde_json::json!({
            "task_id": task_id
        });
        match kanban_post(&path, body).await {
            Ok(_) => success_count += 1,
            Err(e) => {
                failed_count += 1;
                errors.push(format!("执行任务 {} 失败: {}", task_id, e));
            }
        }
    }

    Ok(BatchOperationResult {
        success_count,
        failed_count,
        errors,
    })
}
