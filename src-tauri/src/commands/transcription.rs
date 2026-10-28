#![allow(non_snake_case)]

//! 语音转写命令
//!
//! 前端录好音频后把 base64 传进来，这里转成字节发给
//! OpenAI 兼容的 `/v1/audio/transcriptions`。前端不直接发 HTTP 请求。
//!
//! 配置（Base URL / Key / 模型 / 语言）统一存在 `settings.json` 的
//! `voiceInput` 里，由后端读取，前端不持有 API Key。

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::Serialize;

use crate::services::transcription;
use crate::settings;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceTranscribeResult {
    pub text: String,
}

/// 转写一段音频
///
/// `audio_base64` 是录音原始字节的 base64（不含 `data:` 前缀）。
#[tauri::command(rename_all = "camelCase")]
pub async fn transcribe_audio(
    mime_type: String,
    audio_base64: String,
) -> Result<VoiceTranscribeResult, String> {
    let cfg = settings::get_settings().voice_input.unwrap_or_default();

    if !cfg.enabled {
        return Err("语音输入未启用，请先在设置中开启".to_string());
    }

    let audio = STANDARD
        .decode(audio_base64.as_bytes())
        .map_err(|e| format!("音频解码失败: {e}"))?;

    let result = transcription::transcribe(
        &cfg.base_url,
        &cfg.api_key,
        &cfg.model,
        cfg.language.as_deref(),
        "voice-input",
        &mime_type,
        audio,
    )
    .await?;

    Ok(VoiceTranscribeResult { text: result.text })
}

/// 本地校验语音输入配置是否齐全（不发网络请求）
#[tauri::command(rename_all = "camelCase")]
pub async fn validate_voice_input_config() -> Result<bool, String> {
    let cfg = settings::get_settings().voice_input.unwrap_or_default();
    if cfg.api_key.trim().is_empty() {
        return Err("语音转写 API Key 未配置".to_string());
    }
    transcription::build_transcribe_candidates(&cfg.base_url).map(|_| true)
}
