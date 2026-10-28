import { describe, expect, it } from "vitest";
import {
  CLAUDE_ONE_M_MARKER,
  hasClaudeOneMMarker,
  setClaudeOneMMarker,
  stripClaudeOneMMarker,
} from "@/components/providers/forms/hooks/useModelState";

describe("Claude 1M 声明后缀", () => {
  it("标记常量是 [1M]", () => {
    expect(CLAUDE_ONE_M_MARKER).toBe("[1M]");
  });

  it("大小写不敏感地识别后缀", () => {
    expect(hasClaudeOneMMarker("kimi-k3 [1M]")).toBe(true);
    expect(hasClaudeOneMMarker("kimi-k3 [1m]")).toBe(true);
    expect(hasClaudeOneMMarker("kimi-k3 [1m]  ")).toBe(true);
    expect(hasClaudeOneMMarker("kimi-k3")).toBe(false);
    expect(hasClaudeOneMMarker("")).toBe(false);
  });

  it("去掉后缀并保留其余内容", () => {
    expect(stripClaudeOneMMarker("kimi-k3 [1M]")).toBe("kimi-k3");
    expect(stripClaudeOneMMarker("kimi-k3")).toBe("kimi-k3");
  });

  it("按需追加 / 移除后缀", () => {
    expect(setClaudeOneMMarker("kimi-k3", true)).toBe("kimi-k3[1M]");
    expect(setClaudeOneMMarker("kimi-k3 [1M]", true)).toBe("kimi-k3[1M]");
    expect(setClaudeOneMMarker("kimi-k3 [1M]", false)).toBe("kimi-k3");
    expect(setClaudeOneMMarker("", true)).toBe("");
  });
});
