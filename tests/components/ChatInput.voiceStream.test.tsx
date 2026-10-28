import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatInput } from "@/components/chat/ChatInput";

vi.mock("@/lib/api/chat", () => ({
  chatApi: { readFile: vi.fn() },
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

const settingsData = { voiceInput: { enabled: false } };
vi.mock("@/lib/query", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/query")>("@/lib/query");
  return {
    ...actual,
    useSettingsQuery: () => ({ data: settingsData }),
  };
});

// 用一个可控的假 hook 验证「临时结果整体替换」的文本铺排逻辑
let emitPartial: (text: string) => void = () => {};
let emitFinal: (text: string) => void = () => {};
vi.mock("@/hooks/useVoiceInput", () => ({
  useVoiceInput: (opts: {
    onPartial: (t: string) => void;
    onFinal: (t: string) => void;
  }) => {
    emitPartial = opts.onPartial;
    emitFinal = opts.onFinal;
    return {
      status: "recording",
      durationSec: 0,
      error: null,
      start: vi.fn(),
      stop: vi.fn(),
      cancel: vi.fn(),
      isRecording: true,
      isBusy: false,
    };
  },
}));

const baseProps = {
  onSend: vi.fn(),
  onStop: vi.fn(),
  isStreaming: false,
};

describe("ChatInput 语音文本铺排", () => {
  it("临时结果整体替换，不会一段段追加", async () => {
    settingsData.voiceInput.enabled = true;
    render(<ChatInput {...baseProps} />);

    const textarea = screen.getByPlaceholderText<HTMLTextAreaElement>(
      "hermes.chat.placeholder",
    );
    textarea.value = "";
    textarea.setSelectionRange(0, 0);

    emitPartial("你好");
    expect(textarea.value).toBe(" 你好".trimStart());

    emitPartial("你好，世界");
    expect(textarea.value).toBe("你好，世界");

    emitPartial("你好，世界。今天天气不错");
    expect(textarea.value).toBe("你好，世界。今天天气不错");

    emitFinal("你好，世界。今天天气不错。");
    await waitFor(() => {
      expect(textarea.value).toBe("你好，世界。今天天气不错。");
    });

    // 结束后再来的临时结果应作为新内容插入
    emitPartial("第二段");
    expect(textarea.value).toBe("你好，世界。今天天气不错。 第二段");
  });

  it("插入点之前的文本保持不变", () => {
    settingsData.voiceInput.enabled = true;
    render(<ChatInput {...baseProps} />);

    const textarea = screen.getByPlaceholderText<HTMLTextAreaElement>(
      "hermes.chat.placeholder",
    );
    textarea.value = "前缀：";
    textarea.setSelectionRange(3, 3);

    emitPartial("识别一");
    expect(textarea.value).toBe("前缀： 识别一");

    emitPartial("识别一，识别二");
    expect(textarea.value).toBe("前缀： 识别一，识别二");

    emitFinal("识别一，识别二。");
    expect(textarea.value).toBe("前缀： 识别一，识别二。");
  });
});
