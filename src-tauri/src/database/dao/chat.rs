//! Chat sessions and messages DAO
//!
//! Provides CRUD operations for Hermes Chat feature.

use crate::database::{lock_conn, Database};
use crate::error::AppError;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSession {
    pub id: String,
    pub title: Option<String>,
    pub model: Option<String>,
    pub system_prompt: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub message_count: i64,
    pub project_dir: Option<String>,
    pub agent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub tool_calls: Option<String>,
    pub tool_call_id: Option<String>,
    pub name: Option<String>,
    pub file_refs: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageInput {
    pub role: String,
    pub content: String,
    pub tool_calls: Option<String>,
    pub tool_call_id: Option<String>,
    pub name: Option<String>,
    pub file_refs: Option<String>,
}

impl Database {
    pub fn create_chat_session(
        &self,
        id: &str,
        title: Option<&str>,
        model: Option<&str>,
        system_prompt: Option<&str>,
        project_dir: Option<&str>,
        agent_id: Option<&str>,
    ) -> Result<ChatSession, AppError> {
        let conn = lock_conn!(self.conn);
        let now = chrono::Utc::now().timestamp_millis();
        conn.execute(
            "INSERT INTO chat_sessions (id, title, model, system_prompt, created_at, updated_at, message_count, project_dir, agent_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5, 0, ?6, ?7)",
            params![id, title, model, system_prompt, now, project_dir, agent_id],
        )
        .map_err(|e| AppError::Database(format!("创建 chat session 失败: {e}")))?;

        Ok(ChatSession {
            id: id.to_string(),
            title: title.map(|s| s.to_string()),
            model: model.map(|s| s.to_string()),
            system_prompt: system_prompt.map(|s| s.to_string()),
            created_at: now,
            updated_at: now,
            message_count: 0,
            project_dir: project_dir.map(|s| s.to_string()),
            agent_id: agent_id.map(|s| s.to_string()),
        })
    }

    pub fn list_chat_sessions(&self, agent_id: Option<&str>) -> Result<Vec<ChatSession>, AppError> {
        let conn = lock_conn!(self.conn);
        let sql = if agent_id.is_some() {
            "SELECT id, title, model, system_prompt, created_at, updated_at, message_count, project_dir, agent_id
             FROM chat_sessions WHERE agent_id = ?1 ORDER BY updated_at DESC"
        } else {
            "SELECT id, title, model, system_prompt, created_at, updated_at, message_count, project_dir, agent_id
             FROM chat_sessions WHERE agent_id IS NULL ORDER BY updated_at DESC"
        };
        let mut stmt = conn
            .prepare(sql)
            .map_err(|e| AppError::Database(format!("准备 chat sessions 查询失败: {e}")))?;

        let map_row = |row: &rusqlite::Row<'_>| {
            Ok(ChatSession {
                id: row.get(0)?,
                title: row.get(1)?,
                model: row.get(2)?,
                system_prompt: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                message_count: row.get(6)?,
                project_dir: row.get(7)?,
                agent_id: row.get(8)?,
            })
        };

        let rows = if let Some(aid) = agent_id {
            stmt.query_map(params![aid], map_row)
        } else {
            stmt.query_map([], map_row)
        }
        .map_err(|e| AppError::Database(format!("查询 chat sessions 失败: {e}")))?;

        let mut sessions = Vec::new();
        for row in rows {
            sessions.push(row.map_err(|e| AppError::Database(e.to_string()))?);
        }
        Ok(sessions)
    }

    pub fn get_chat_session(&self, id: &str) -> Result<Option<ChatSession>, AppError> {
        let conn = lock_conn!(self.conn);
        let result = conn.query_row(
            "SELECT id, title, model, system_prompt, created_at, updated_at, message_count, project_dir, agent_id
             FROM chat_sessions WHERE id = ?1",
            params![id],
            |row| {
                Ok(ChatSession {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    model: row.get(2)?,
                    system_prompt: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                    message_count: row.get(6)?,
                    project_dir: row.get(7)?,
                    agent_id: row.get(8)?,
                })
            },
        );

        match result {
            Ok(session) => Ok(Some(session)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(format!("查询 chat session 失败: {e}"))),
        }
    }

    pub fn update_chat_session(
        &self,
        id: &str,
        title: Option<&str>,
        model: Option<&str>,
        system_prompt: Option<&str>,
    ) -> Result<bool, AppError> {
        let conn = lock_conn!(self.conn);
        let now = chrono::Utc::now().timestamp_millis();

        let mut sets = vec!["updated_at = ?1"];
        let mut param_idx = 2u32;
        let mut values: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(now)];

        if let Some(t) = title {
            sets.push("title = ?2");
            values.push(Box::new(t.to_string()));
            param_idx = 3;
        }
        if let Some(m) = model {
            let placeholder = if param_idx == 2 { "?2" } else { "?3" };
            sets.push(if placeholder == "?2" {
                "model = ?2"
            } else {
                "model = ?3"
            });
            values.push(Box::new(m.to_string()));
            param_idx += 1;
        }
        if let Some(s) = system_prompt {
            let placeholder = match param_idx {
                2 => "?2",
                3 => "?3",
                _ => "?4",
            };
            sets.push(match placeholder {
                "?2" => "system_prompt = ?2",
                "?3" => "system_prompt = ?3",
                _ => "system_prompt = ?4",
            });
            values.push(Box::new(s.to_string()));
            param_idx += 1;
        }

        let id_placeholder = format!("?{param_idx}");
        values.push(Box::new(id.to_string()));

        let sql = format!(
            "UPDATE chat_sessions SET {} WHERE id = {}",
            sets.join(", "),
            id_placeholder
        );

        let params_ref: Vec<&dyn rusqlite::ToSql> = values.iter().map(|v| v.as_ref()).collect();
        let affected = conn
            .execute(&sql, params_ref.as_slice())
            .map_err(|e| AppError::Database(format!("更新 chat session 失败: {e}")))?;

        Ok(affected > 0)
    }

    pub fn delete_chat_session(&self, id: &str) -> Result<bool, AppError> {
        let conn = lock_conn!(self.conn);
        let affected = conn
            .execute("DELETE FROM chat_sessions WHERE id = ?1", params![id])
            .map_err(|e| AppError::Database(format!("删除 chat session 失败: {e}")))?;
        Ok(affected > 0)
    }

    pub fn insert_chat_message(
        &self,
        session_id: &str,
        message_id: &str,
        input: &ChatMessageInput,
    ) -> Result<ChatMessage, AppError> {
        let conn = lock_conn!(self.conn);
        let now = chrono::Utc::now().timestamp_millis();

        conn.execute(
            "INSERT INTO chat_messages (id, session_id, role, content, tool_calls, tool_call_id, name, file_refs, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                message_id,
                session_id,
                input.role,
                input.content,
                input.tool_calls,
                input.tool_call_id,
                input.name,
                input.file_refs,
                now,
            ],
        )
        .map_err(|e| AppError::Database(format!("插入 chat message 失败: {e}")))?;

        conn.execute(
            "UPDATE chat_sessions SET message_count = message_count + 1, updated_at = ?1 WHERE id = ?2",
            params![now, session_id],
        )
        .map_err(|e| AppError::Database(format!("更新 session 计数失败: {e}")))?;

        Ok(ChatMessage {
            id: message_id.to_string(),
            session_id: session_id.to_string(),
            role: input.role.clone(),
            content: input.content.clone(),
            tool_calls: input.tool_calls.clone(),
            tool_call_id: input.tool_call_id.clone(),
            name: input.name.clone(),
            file_refs: input.file_refs.clone(),
            created_at: now,
        })
    }

    pub fn insert_chat_messages_batch(
        &self,
        session_id: &str,
        messages: &[(String, ChatMessageInput)],
    ) -> Result<Vec<ChatMessage>, AppError> {
        let conn = lock_conn!(self.conn);
        let now = chrono::Utc::now().timestamp_millis();
        let mut result = Vec::with_capacity(messages.len());

        for (message_id, input) in messages {
            conn.execute(
                "INSERT INTO chat_messages (id, session_id, role, content, tool_calls, tool_call_id, name, file_refs, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    message_id,
                    session_id,
                    input.role,
                    input.content,
                    input.tool_calls,
                    input.tool_call_id,
                    input.name,
                    input.file_refs,
                    now,
                ],
            )
            .map_err(|e| AppError::Database(format!("批量插入 chat message 失败: {e}")))?;

            result.push(ChatMessage {
                id: message_id.clone(),
                session_id: session_id.to_string(),
                role: input.role.clone(),
                content: input.content.clone(),
                tool_calls: input.tool_calls.clone(),
                tool_call_id: input.tool_call_id.clone(),
                name: input.name.clone(),
                file_refs: input.file_refs.clone(),
                created_at: now,
            });
        }

        let count = messages.len() as i64;
        conn.execute(
            "UPDATE chat_sessions SET message_count = message_count + ?1, updated_at = ?2 WHERE id = ?3",
            params![count, now, session_id],
        )
        .map_err(|e| AppError::Database(format!("更新 session 计数失败: {e}")))?;

        Ok(result)
    }

    pub fn get_chat_messages(&self, session_id: &str) -> Result<Vec<ChatMessage>, AppError> {
        let conn = lock_conn!(self.conn);
        let mut stmt = conn
            .prepare(
                "SELECT id, session_id, role, content, tool_calls, tool_call_id, name, file_refs, created_at
                 FROM chat_messages WHERE session_id = ?1 ORDER BY created_at ASC",
            )
            .map_err(|e| AppError::Database(format!("准备 chat messages 查询失败: {e}")))?;

        let rows = stmt
            .query_map(params![session_id], |row| {
                Ok(ChatMessage {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    tool_calls: row.get(4)?,
                    tool_call_id: row.get(5)?,
                    name: row.get(6)?,
                    file_refs: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })
            .map_err(|e| AppError::Database(format!("查询 chat messages 失败: {e}")))?;

        let mut messages = Vec::new();
        for row in rows {
            messages.push(row.map_err(|e| AppError::Database(e.to_string()))?);
        }
        Ok(messages)
    }

    pub fn delete_chat_message(&self, message_id: &str) -> Result<bool, AppError> {
        let conn = lock_conn!(self.conn);

        let session_id: Option<String> = conn
            .query_row(
                "SELECT session_id FROM chat_messages WHERE id = ?1",
                params![message_id],
                |row| row.get(0),
            )
            .ok();

        let affected = conn
            .execute("DELETE FROM chat_messages WHERE id = ?1", params![message_id])
            .map_err(|e| AppError::Database(format!("删除 chat message 失败: {e}")))?;

        if affected > 0 {
            if let Some(sid) = session_id {
                let now = chrono::Utc::now().timestamp_millis();
                let _ = conn.execute(
                    "UPDATE chat_sessions SET message_count = MAX(0, message_count - 1), updated_at = ?1 WHERE id = ?2",
                    params![now, sid],
                );
            }
        }

        Ok(affected > 0)
    }

    pub fn clear_chat_messages(&self, session_id: &str) -> Result<u64, AppError> {
        let conn = lock_conn!(self.conn);
        let affected = conn
            .execute(
                "DELETE FROM chat_messages WHERE session_id = ?1",
                params![session_id],
            )
            .map_err(|e| AppError::Database(format!("清除 chat messages 失败: {e}")))?;

        let now = chrono::Utc::now().timestamp_millis();
        let _ = conn.execute(
            "UPDATE chat_sessions SET message_count = 0, updated_at = ?1 WHERE id = ?2",
            params![now, session_id],
        );

        Ok(affected as u64)
    }
}
