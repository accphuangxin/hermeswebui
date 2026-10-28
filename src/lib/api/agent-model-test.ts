import { invoke } from "@tauri-apps/api/core";

/** 单个模型的可用性测试结果 */
export interface AgentModelTestResult {
  /** 是否成功拿到 chat completions 结构 */
  ok: boolean;
  /** 从发起请求到收到响应的耗时 */
  latencyMs: number;
  /** HTTP 状态码；网络层失败时为 null */
  httpStatus: number | null;
  /** 成功时为 "OK"，失败时为供应商返回的错误信息 */
  message: string;
}

/**
 * 测试指定模型是否可用
 *
 * 用表单里当前填写的 Base URL 与 API Key 向 OpenAI 兼容的
 * `POST /chat/completions` 发一次最小请求（`max_tokens: 1`），
 * 只校验连通性与鉴权，不消耗有意义的额度。
 */
export async function testAgentProviderModel(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<AgentModelTestResult> {
  return invoke<AgentModelTestResult>("test_agent_provider_model", {
    baseUrl,
    apiKey,
    model,
  });
}
