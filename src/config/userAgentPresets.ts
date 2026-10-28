/**
 * 自定义 User-Agent 的常用预设。
 *
 * 一些供应商（尤其是中转站）会对客户端 User-Agent 做风控或区分计费，
 * 这里提供常见浏览器 / 官方 CLI 的取值，方便一键填入。
 */
export const USER_AGENT_PRESETS: string[] = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "claude-cli/2.0.0 (external, cli)",
  "openai-node/5.0.0",
];
