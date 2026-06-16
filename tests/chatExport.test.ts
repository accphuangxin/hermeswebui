import { describe, it, expect } from "vitest";
import { formatSessionAsMarkdown } from "@/lib/chatExport";
import type { ChatMessage } from "@/types";

const baseMsg = (overrides: Partial<ChatMessage>): ChatMessage => ({
  id: "1",
  sessionId: "s1",
  role: "user",
  content: "hello",
  toolCalls: null,
  toolCallId: null,
  name: null,
  fileRefs: null,
  createdAt: 0,
  ...overrides,
});

describe("formatSessionAsMarkdown", () => {
  it("includes session title as h1", () => {
    const md = formatSessionAsMarkdown("My Chat", "gpt-4", []);
    expect(md).toContain("# My Chat");
  });

  it("uses fallback title when null", () => {
    const md = formatSessionAsMarkdown(null, "gpt-4", []);
    expect(md).toContain("# 未命名会话");
  });

  it("includes model name", () => {
    const md = formatSessionAsMarkdown("t", "gpt-5.5", []);
    expect(md).toContain("**模型**: gpt-5.5");
  });

  it("omits model line when model is empty", () => {
    const md = formatSessionAsMarkdown("t", "", []);
    expect(md).not.toContain("**模型**");
  });

  it("renders user message with 👤 heading", () => {
    const md = formatSessionAsMarkdown("t", "", [baseMsg({ role: "user", content: "hi" })]);
    expect(md).toContain("## 👤 用户");
    expect(md).toContain("hi");
  });

  it("renders assistant message with 🤖 heading", () => {
    const md = formatSessionAsMarkdown("t", "", [
      baseMsg({ role: "assistant", content: "world" }),
    ]);
    expect(md).toContain("## 🤖 助手");
    expect(md).toContain("world");
  });

  it("skips timeline messages", () => {
    const md = formatSessionAsMarkdown("t", "", [
      baseMsg({ role: "timeline", content: '{"tool":"bash"}' }),
    ]);
    expect(md).not.toContain("timeline");
    expect(md).not.toContain("bash");
  });
});
