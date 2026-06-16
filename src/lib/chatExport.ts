import type { ChatMessage } from "@/types";

export function formatSessionAsMarkdown(
  title: string | null,
  model: string | null,
  messages: ChatMessage[],
): string {
  const sessionTitle = title ?? "未命名会话";
  const exportTime = new Date().toLocaleString("zh-CN");

  const lines: string[] = [`# ${sessionTitle}`, ""];
  lines.push(`**导出时间**: ${exportTime}`);
  if (model) lines.push(`**模型**: ${model}`);
  lines.push("", "---", "");

  for (const msg of messages) {
    if (msg.role === "user") {
      lines.push("## 👤 用户", "", msg.content, "", "---", "");
    } else if (msg.role === "assistant") {
      lines.push("## 🤖 助手", "", msg.content, "", "---", "");
    }
    // timeline and other roles are intentionally skipped
  }

  return lines.join("\n");
}
