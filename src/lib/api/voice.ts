import { invoke } from "@tauri-apps/api/core";

export interface VoiceTranscribeResult {
  text: string;
}

/**
 * 语音转写 API。
 *
 * 约定：所有网络请求都由 Rust 侧发起（WKWebView 下前端直接 fetch 会被拦截）。
 */
export const voiceApi = {
  /**
   * 转写一段录音。
   *
   * @param mimeType 录音的 MIME，如 `audio/webm`
   * @param audioBase64 录音原始字节的 base64（不含 `data:` 前缀）
   */
  async transcribe(
    mimeType: string,
    audioBase64: string,
  ): Promise<VoiceTranscribeResult> {
    return await invoke("transcribe_audio", { mimeType, audioBase64 });
  },

  /** 本地校验配置是否齐全（不发网络请求） */
  async validateConfig(): Promise<boolean> {
    return await invoke("validate_voice_input_config");
  },
};
