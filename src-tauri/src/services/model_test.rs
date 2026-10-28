//! 模型可用性测试服务
//!
//! 用表单里的 `base_url` + `api_key` + `model` 发一次最小的
//! OpenAI 兼容 `/chat/completions` 请求，用来判断该模型当前是否可用。
//!
//! 与 [`crate::services::model_fetch`] 互补：那里只验证「能不能列出模型」，
//! 这里验证「这个模型能不能真正出字」。

use reqwest::StatusCode;
use serde::Serialize;
use std::time::{Duration, Instant};

use super::model_fetch::strip_compat_suffix;

/// 单次测试的超时时间：推理模型首包可能偏慢，比列表接口宽松一些。
const TEST_TIMEOUT_SECS: u64 = 30;

/// 错误响应体截断长度，避免把整页 HTML 塞进提示里。
const ERROR_BODY_MAX_CHARS: usize = 512;

/// 测试结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelTestResult {
    /// 请求是否成功拿到 chat completions 结构
    pub ok: bool,
    /// 从发起请求到收到响应的耗时
    pub latency_ms: u64,
    /// HTTP 状态码；网络层失败时为 `None`
    pub http_status: Option<u16>,
    /// 给用户看的说明：成功时为 `OK`，失败时为供应商返回的错误
    pub message: String,
}

/// 测试指定模型是否可用
///
/// 请求体取最小规模：单条 user 消息 + `max_tokens: 1`，只验证连通性与鉴权，
/// 不消耗有意义的额度。`404/405` 视为「路径不对」，尝试下一个候选 URL。
pub async fn test_model(
    base_url: &str,
    api_key: &str,
    model: &str,
) -> Result<ModelTestResult, String> {
    let api_key = api_key.trim();
    let model = model.trim();
    if api_key.is_empty() {
        return Err("API Key is required to test a model".to_string());
    }
    if model.is_empty() {
        return Err("Model ID is required to test a model".to_string());
    }

    let candidates = build_chat_url_candidates(base_url)?;
    let client = crate::proxy::http_client::get();
    let body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": "hi" }],
        "max_tokens": 1,
        "stream": false,
    });

    let mut last_err: Option<ModelTestResult> = None;

    for url in &candidates {
        log::debug!("[ModelTest] Trying endpoint: {url}");
        let started = Instant::now();
        let response = client
            .post(url)
            .header("Authorization", format!("Bearer {api_key}"))
            .header("Content-Type", "application/json")
            .body(body.to_string())
            .timeout(Duration::from_secs(TEST_TIMEOUT_SECS))
            .send()
            .await;

        let response = match response {
            Ok(r) => r,
            Err(e) => {
                return Ok(ModelTestResult {
                    ok: false,
                    latency_ms: started.elapsed().as_millis() as u64,
                    http_status: None,
                    message: format!("请求失败: {e}"),
                });
            }
        };

        let latency_ms = started.elapsed().as_millis() as u64;
        let status = response.status();
        let text = response.text().await.unwrap_or_default();

        if status.is_success() {
            let json: serde_json::Value =
                serde_json::from_str(&text).unwrap_or(serde_json::Value::Null);
            if json
                .get("choices")
                .and_then(|c| c.as_array())
                .is_some_and(|c| !c.is_empty())
            {
                return Ok(ModelTestResult {
                    ok: true,
                    latency_ms,
                    http_status: Some(status.as_u16()),
                    message: "OK".to_string(),
                });
            }
            // 200 但不是 chat completions 结构：多是网关把未知路径兜底成了 HTML 页
            return Ok(ModelTestResult {
                ok: false,
                latency_ms,
                http_status: Some(status.as_u16()),
                message: format!("响应不是 Chat Completions 格式: {}", truncate_body(&text)),
            });
        }

        let result = ModelTestResult {
            ok: false,
            latency_ms,
            http_status: Some(status.as_u16()),
            message: extract_error_message(&text)
                .unwrap_or_else(|| truncate_body(&text).trim().to_string()),
        };

        if status == StatusCode::NOT_FOUND || status == StatusCode::METHOD_NOT_ALLOWED {
            last_err = Some(result);
            continue;
        }

        return Ok(result);
    }

    Ok(last_err.unwrap_or(ModelTestResult {
        ok: false,
        latency_ms: 0,
        http_status: None,
        message: "没有可用的候选端点".to_string(),
    }))
}

/// 构造 chat completions 端点的候选 URL
///
/// 顺序：
/// 1. baseURL 本身就是完整的 `/chat/completions` 地址 → 原样使用
/// 2. 以 `/v1` 结尾 → 拼 `/chat/completions`
/// 3. 其他 → 拼 `/v1/chat/completions`
/// 4. baseURL 命中 Anthropic 兼容子路径时，剥离后再拼 `/v1/chat/completions`
pub(crate) fn build_chat_url_candidates(base_url: &str) -> Result<Vec<String>, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Base URL is empty".to_string());
    }

    let mut candidates = Vec::with_capacity(2);

    if trimmed.ends_with("/chat/completions") {
        candidates.push(trimmed.to_string());
    } else if trimmed.ends_with("/v1") {
        candidates.push(format!("{trimmed}/chat/completions"));
    } else {
        candidates.push(format!("{trimmed}/v1/chat/completions"));
    }

    if let Some(stripped) = strip_compat_suffix(trimmed) {
        let root = stripped.trim_end_matches('/');
        if !root.is_empty() && root.contains("://") {
            candidates.push(format!("{root}/v1/chat/completions"));
        }
    }

    candidates.dedup();
    Ok(candidates)
}

/// 优先取 OpenAI 风格的 `error.message`，取不到再退回原始响应体。
fn extract_error_message(body: &str) -> Option<String> {
    let json: serde_json::Value = serde_json::from_str(body).ok()?;
    let message = json
        .get("error")
        .and_then(|e| e.get("message"))
        .and_then(|m| m.as_str())
        .or_else(|| json.get("message").and_then(|m| m.as_str()))
        .or_else(|| json.get("detail").and_then(|m| m.as_str()))?;
    Some(truncate_body(message))
}

fn truncate_body(body: &str) -> String {
    if body.chars().count() <= ERROR_BODY_MAX_CHARS {
        body.to_string()
    } else {
        let mut s: String = body.chars().take(ERROR_BODY_MAX_CHARS).collect();
        s.push('…');
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_candidates_plain_root() {
        let c = build_chat_url_candidates("https://api.example.com").unwrap();
        assert_eq!(c, vec!["https://api.example.com/v1/chat/completions"]);
    }

    #[test]
    fn test_candidates_with_v1() {
        let c = build_chat_url_candidates("https://api.example.com/v1/").unwrap();
        assert_eq!(c, vec!["https://api.example.com/v1/chat/completions"]);
    }

    #[test]
    fn test_candidates_full_chat_url() {
        let c = build_chat_url_candidates("https://api.example.com/v1/chat/completions").unwrap();
        assert_eq!(c, vec!["https://api.example.com/v1/chat/completions"]);
    }

    #[test]
    fn test_candidates_anthropic_suffix_falls_back_to_root() {
        let c = build_chat_url_candidates("https://api.deepseek.com/anthropic").unwrap();
        assert_eq!(
            c,
            vec![
                "https://api.deepseek.com/anthropic/v1/chat/completions",
                "https://api.deepseek.com/v1/chat/completions",
            ]
        );
    }

    #[test]
    fn test_candidates_empty() {
        assert!(build_chat_url_candidates("").is_err());
    }

    #[test]
    fn test_extract_error_message_openai_style() {
        let body = r#"{"error":{"message":"model not found","type":"invalid_request_error"}}"#;
        assert_eq!(
            extract_error_message(body).as_deref(),
            Some("model not found")
        );
    }

    #[test]
    fn test_extract_error_message_plain_text() {
        assert_eq!(extract_error_message("<html>404</html>"), None);
    }
}
