import { render } from "@testing-library/react";
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

vi.mock("@/lib/api/voice", () => ({
  voiceApi: { transcribe: vi.fn(), validateConfig: vi.fn() },
}));

const baseProps = {
  onSend: vi.fn(),
  onStop: vi.fn(),
  isStreaming: false,
};

describe("ChatInput 语音入口", () => {
  it("语音未启用时麦克风按钮依然可见（点击提示去设置）", () => {
    settingsData.voiceInput.enabled = false;
    render(<ChatInput {...baseProps} />);

    const mic = document.querySelector('button[title*="语音"]');
    expect(mic).toBeTruthy();
  });

  it("语音启用后麦克风按钮可录音", () => {
    settingsData.voiceInput.enabled = true;
    render(<ChatInput {...baseProps} />);

    const mic = document.querySelector('button[title*="语音"]');
    expect(mic).toBeTruthy();
    expect(mic?.hasAttribute("disabled")).toBe(false);
  });
});
