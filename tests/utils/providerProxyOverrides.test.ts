import { describe, expect, it } from "vitest";
import { parseJsonObjectOverride } from "@/components/providers/forms/LocalProxyRequestOverridesField";
import { isValidUserAgentHeader } from "@/lib/userAgent";

describe("本地代理请求覆盖解析", () => {
  it("空字符串表示不覆盖", () => {
    expect(parseJsonObjectOverride("")).toBeNull();
    expect(parseJsonObjectOverride("   ")).toBeNull();
  });

  it("解析 JSON 对象", () => {
    expect(parseJsonObjectOverride('{"x-test": "1"}')).toEqual({
      "x-test": "1",
    });
    expect(parseJsonObjectOverride('{"temperature": 0.7}')).toEqual({
      temperature: 0.7,
    });
  });

  it("非法 JSON 或非对象返回 null", () => {
    expect(parseJsonObjectOverride("{")).toBeNull();
    expect(parseJsonObjectOverride("[1, 2]")).toBeNull();
    expect(parseJsonObjectOverride("null")).toBeNull();
    expect(parseJsonObjectOverride('"text"')).toBeNull();
  });
});

describe("自定义 User-Agent 校验", () => {
  it("空值与普通 UA 合法", () => {
    expect(isValidUserAgentHeader("")).toBe(true);
    expect(isValidUserAgentHeader("Mozilla/5.0 (Macintosh)")).toBe(true);
  });

  it("拒绝控制字符", () => {
    expect(isValidUserAgentHeader("Mozilla/5.0\nInjected: 1")).toBe(false);
    expect(isValidUserAgentHeader("a\rb")).toBe(false);
    expect(isValidUserAgentHeader("a\u0000b")).toBe(false);
  });
});
