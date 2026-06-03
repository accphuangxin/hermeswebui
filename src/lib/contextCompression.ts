import type { ChatMessage } from "@/types";

// 1 token ≈ 4 chars（粗估）
const CHARS_PER_TOKEN = 4;
const DEFAULT_CONTEXT_WINDOW = 8000;
const COMPRESS_RATIO = 0.6;
const KEEP_RATIO = 0.3;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface CompressResult {
  compressedInput: string;
  wasCompressed: boolean;
  droppedCount: number;
}

/**
 * 将本地历史消息 + 当前用户输入拼成上下文。
 * 若历史超过阈值，截掉最旧的消息，保留最近的部分，
 * 并在最前面加一条摘要说明告知模型历史被截断。
 */
export function compressContext(
  messages: ChatMessage[],
  currentInput: string,
  contextWindow = DEFAULT_CONTEXT_WINDOW,
): CompressResult {
  const COMPRESS_THRESHOLD_TOKENS = Math.floor(contextWindow * COMPRESS_RATIO);
  const KEEP_RECENT_TOKENS = Math.floor(contextWindow * KEEP_RATIO);

  const history = messages.filter((m) => m.role !== "tool");

  // 计算总 token
  const totalTokens = history.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0,
  );

  if (totalTokens <= COMPRESS_THRESHOLD_TOKENS) {
    // 不需要压缩，直接拼历史 + 当前输入
    const formatted = formatHistory(history);
    const compressedInput = formatted
      ? `${formatted}\n\nUser: ${currentInput}`
      : currentInput;
    return { compressedInput, wasCompressed: false, droppedCount: 0 };
  }

  // 从最新消息往前取，直到达到 KEEP_RECENT_TOKENS
  // 单条消息内容超长时截断到 KEEP_RECENT_TOKENS 的一半
  const MAX_SINGLE_MSG_TOKENS = Math.floor(KEEP_RECENT_TOKENS / 2);
  let kept: ChatMessage[] = [];
  let accumulated = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    let msg = history[i];
    let tokens = estimateTokens(msg.content);
    if (tokens > MAX_SINGLE_MSG_TOKENS) {
      const maxChars = MAX_SINGLE_MSG_TOKENS * CHARS_PER_TOKEN;
      msg = { ...msg, content: msg.content.slice(-maxChars) + "\n[... 内容过长已截断]" };
      tokens = MAX_SINGLE_MSG_TOKENS;
    }
    if (accumulated + tokens > KEEP_RECENT_TOKENS) break;
    kept.unshift(msg);
    accumulated += tokens;
  }

  const droppedCount = history.length - kept.length;
  const summaryPrefix =
    `[注意：以下对话是从第 ${droppedCount + 1} 条消息开始的片段，` +
    `共 ${history.length} 条历史消息中有 ${droppedCount} 条因上下文过长已被省略。]\n\n`;

  const formatted = formatHistory(kept);
  const compressedInput = formatted
    ? `${summaryPrefix}${formatted}\n\nUser: ${currentInput}`
    : currentInput;

  return { compressedInput, wasCompressed: true, droppedCount };
}

function formatHistory(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      const role = m.role === "assistant" ? "Assistant" : "User";
      return `${role}: ${m.content}`;
    })
    .join("\n\n");
}
