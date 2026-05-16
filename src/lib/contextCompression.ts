import type { ChatMessage } from "@/types";

// 1 token ≈ 4 chars（粗估）
const CHARS_PER_TOKEN = 4;
// 超过此 token 数时触发压缩
const COMPRESS_THRESHOLD_TOKENS = 6000;
// 压缩后保留最近的 token 数
const KEEP_RECENT_TOKENS = 3000;

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
): CompressResult {
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
  let kept: ChatMessage[] = [];
  let accumulated = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(history[i].content);
    if (accumulated + tokens > KEEP_RECENT_TOKENS) break;
    kept.unshift(history[i]);
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
