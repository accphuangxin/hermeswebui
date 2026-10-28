//! 语音转写服务
//!
//! 把前端录好的音频发到 OpenAI 兼容的 `/v1/audio/transcriptions` 端点，
//! 拿到纯文本返回给聊天输入框。
//!
//! 手写 multipart 而不是用 `reqwest` 的 `multipart` feature，
//! 避免为此引入 `mime_guess` 依赖。

use reqwest::StatusCode;
use serde::Deserialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

/// 单次转写超时。长音频也要留足余量。
const TRANSCRIBE_TIMEOUT_SECS: u64 = 120;

/// 音频体积上限（解码后字节数），防止误传超大文件把内存吃满。
const MAX_AUDIO_BYTES: usize = 25 * 1024 * 1024;

/// 错误响应体截断长度。
const ERROR_BODY_MAX_CHARS: usize = 512;

#[derive(Debug, Deserialize)]
struct TranscribeResponse {
    text: Option<String>,
}

/// 转写结果
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeResult {
    /// 识别出的文本（已 trim）
    pub text: String,
}

/// 构造候选的转写端点
///
/// 用户填的 Base URL 可能是 `https://api.x.com`、`https://api.x.com/v1`，
/// 也可能是完整的 `https://api.x.com/v1/audio/transcriptions`。
pub fn build_transcribe_candidates(base_url: &str) -> Result<Vec<String>, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("语音转写 Base URL 未配置".to_string());
    }
    if !trimmed.contains("://") {
        return Err(format!("语音转写 Base URL 不合法: {trimmed}"));
    }

    // 已经是完整端点，直接用
    if trimmed.ends_with("/audio/transcriptions") {
        return Ok(vec![trimmed.to_string()]);
    }

    let mut candidates = Vec::new();
    if trimmed.ends_with("/v1") {
        candidates.push(format!("{trimmed}/audio/transcriptions"));
    } else {
        candidates.push(format!("{trimmed}/v1/audio/transcriptions"));
        candidates.push(format!("{trimmed}/audio/transcriptions"));
    }
    Ok(candidates)
}

/// 用设置里的 Base URL / Key / 模型转写一段音频
///
/// `audio` 为解码后的原始字节；`mime` 形如 `audio/webm`、`audio/mp4`。
pub async fn transcribe(
    base_url: &str,
    api_key: &str,
    model: &str,
    language: Option<&str>,
    filename_hint: &str,
    mime: &str,
    audio: Vec<u8>,
) -> Result<TranscribeResult, String> {
    if api_key.trim().is_empty() {
        return Err("语音转写 API Key 未配置".to_string());
    }
    if audio.is_empty() {
        return Err("录音内容为空".to_string());
    }
    if audio.len() > MAX_AUDIO_BYTES {
        return Err(format!(
            "录音体积过大（{} MB），超过 {} MB 上限",
            audio.len() / (1024 * 1024),
            MAX_AUDIO_BYTES / (1024 * 1024)
        ));
    }

    let candidates = build_transcribe_candidates(base_url)?;
    let model = if model.trim().is_empty() {
        "whisper-1"
    } else {
        model.trim()
    };
    let filename = format!("{filename_hint}.{}", extension_for_mime(mime));
    let client = crate::proxy::http_client::get();
    let mut last_err: Option<String> = None;

    for url in &candidates {
        let (content_type, body) = build_multipart(
            &[("model", model), ("response_format", "json")],
            language.filter(|l| !l.trim().is_empty()),
            "file",
            &filename,
            mime,
            &audio,
        );

        log::debug!("[Transcribe] POST {url}");

        let response = match client
            .post(url)
            .header("Authorization", format!("Bearer {api_key}"))
            .header("Content-Type", content_type)
            .timeout(Duration::from_secs(TRANSCRIBE_TIMEOUT_SECS))
            .body(body)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => return Err(format!("请求失败: {e}")),
        };

        let status = response.status();

        if status.is_success() {
            let resp: TranscribeResponse = response
                .json()
                .await
                .map_err(|e| format!("解析转写响应失败: {e}"))?;
            let text = resp.text.unwrap_or_default().trim().to_string();
            return Ok(TranscribeResult { text });
        }

        if status == StatusCode::NOT_FOUND || status == StatusCode::METHOD_NOT_ALLOWED {
            let body = truncate_body(response.text().await.unwrap_or_default());
            last_err = Some(format!("HTTP {status}: {body}"));
            continue;
        }

        let body = truncate_body(response.text().await.unwrap_or_default());
        return Err(format!("HTTP {status}: {body}"));
    }

    Err(format!(
        "所有候选端点均不可用: {}",
        last_err.unwrap_or_else(|| "no candidates".to_string())
    ))
}

/// 根据 MIME 猜一个扩展名，部分服务端会依赖文件名判断格式。
fn extension_for_mime(mime: &str) -> &'static str {
    match mime {
        m if m.contains("mp4") => "m4a",
        m if m.contains("mpeg") => "mp3",
        m if m.contains("ogg") => "ogg",
        m if m.contains("wav") => "wav",
        _ => "webm",
    }
}

fn truncate_body(body: String) -> String {
    if body.chars().count() <= ERROR_BODY_MAX_CHARS {
        body
    } else {
        let mut s: String = body.chars().take(ERROR_BODY_MAX_CHARS).collect();
        s.push('…');
        s
    }
}

/// multipart 边界计数器，保证同一进程内边界不重复。
static BOUNDARY_SEQ: AtomicU64 = AtomicU64::new(1);

fn build_multipart(
    fields: &[(&str, &str)],
    language: Option<&str>,
    file_field: &str,
    filename: &str,
    file_mime: &str,
    file_bytes: &[u8],
) -> (String, Vec<u8>) {
    let boundary = format!(
        "----ccswitch{u}{n}",
        u = std::process::id(),
        n = BOUNDARY_SEQ.fetch_add(1, Ordering::Relaxed)
    );
    let mut body: Vec<u8> = Vec::with_capacity(file_bytes.len() + 512);

    let mut push_field = |name: &str, value: &str| {
        body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
        body.extend_from_slice(
            format!("Content-Disposition: form-data; name=\"{name}\"\r\n\r\n").as_bytes(),
        );
        body.extend_from_slice(value.as_bytes());
        body.extend_from_slice(b"\r\n");
    };

    for (name, value) in fields {
        push_field(name, value);
    }
    if let Some(lang) = language {
        push_field("language", lang.trim());
    }

    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
        format!(
            "Content-Disposition: form-data; name=\"{file_field}\"; filename=\"{filename}\"\r\n"
        )
        .as_bytes(),
    );
    body.extend_from_slice(format!("Content-Type: {file_mime}\r\n\r\n").as_bytes());
    body.extend_from_slice(file_bytes);
    body.extend_from_slice(b"\r\n");
    body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());

    (format!("multipart/form-data; boundary={boundary}"), body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidates_from_root() {
        let c = build_transcribe_candidates("https://api.example.com").unwrap();
        assert_eq!(
            c,
            vec![
                "https://api.example.com/v1/audio/transcriptions",
                "https://api.example.com/audio/transcriptions",
            ]
        );
    }

    #[test]
    fn candidates_with_v1_suffix() {
        let c = build_transcribe_candidates("https://api.example.com/v1/").unwrap();
        assert_eq!(c, vec!["https://api.example.com/v1/audio/transcriptions"]);
    }

    #[test]
    fn candidates_full_endpoint() {
        let c =
            build_transcribe_candidates("https://api.example.com/v1/audio/transcriptions").unwrap();
        assert_eq!(c, vec!["https://api.example.com/v1/audio/transcriptions"]);
    }

    #[test]
    fn candidates_reject_empty() {
        assert!(build_transcribe_candidates("  ").is_err());
        assert!(build_transcribe_candidates("api.example.com").is_err());
    }

    #[test]
    fn multipart_contains_fields_and_file() {
        let (content_type, body) = build_multipart(
            &[("model", "whisper-1")],
            Some("zh"),
            "file",
            "audio.m4a",
            "audio/mp4",
            b"RAW",
        );
        assert!(content_type.starts_with("multipart/form-data; boundary="));
        let text = String::from_utf8_lossy(&body);
        assert!(text.contains("name=\"model\"\r\n\r\nwhisper-1"));
        assert!(text.contains("name=\"language\"\r\n\r\nzh"));
        assert!(text.contains("filename=\"audio.m4a\""));
        assert!(text.contains("Content-Type: audio/mp4"));
        assert!(text.contains("RAW"));
        assert!(text.trim_end().ends_with("--"));
    }

    #[test]
    fn extension_mapping() {
        assert_eq!(extension_for_mime("audio/mp4"), "m4a");
        assert_eq!(extension_for_mime("audio/webm;codecs=opus"), "webm");
        assert_eq!(extension_for_mime("audio/mpeg"), "mp3");
    }
}
