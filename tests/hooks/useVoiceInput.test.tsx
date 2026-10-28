import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVoiceInput } from "@/hooks/useVoiceInput";

const transcribeMock = vi.fn();

vi.mock("@/lib/api/voice", () => ({
  voiceApi: {
    transcribe: (...args: unknown[]) => transcribeMock(...args),
    validateConfig: vi.fn(),
  },
}));

/** 极简 MediaRecorder 模拟：start 后立即给一段数据，stop 时触发 onstop */
class FakeMediaRecorder {
  static isTypeSupported = () => true;
  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(
    _stream: unknown,
    options?: { mimeType?: string },
  ) {
    this.mimeType = options?.mimeType ?? "audio/webm";
  }

  start() {
    this.state = "recording";
    // 模拟 timeslice：开录后马上给一段数据，供临时转写使用
    this.ondataavailable?.({
      data: new Blob(["fake-audio"], { type: this.mimeType }),
    });
  }

  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["fake-audio"], { type: this.mimeType }),
    });
    this.onstop?.();
  }
}

const stopTrack = vi.fn();

beforeEach(() => {
  transcribeMock.mockReset();
  stopTrack.mockReset();
  Object.defineProperty(globalThis, "MediaRecorder", {
    value: FakeMediaRecorder,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: stopTrack }],
      }),
    },
  });
});

describe("useVoiceInput", () => {
  it("录音停止后把最终文本回调出去", async () => {
    transcribeMock.mockResolvedValue({ text: "  你好世界  " });
    const onPartial = vi.fn();
    const onFinal = vi.fn();
    const { result } = renderHook(() =>
      useVoiceInput({ onPartial, onFinal }),
    );

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.isRecording).toBe(true);

    await act(async () => {
      result.current.stop();
    });

    await waitFor(() => {
      expect(onFinal).toHaveBeenCalledWith("你好世界");
    });
    expect(result.current.isRecording).toBe(false);
    expect(stopTrack).toHaveBeenCalled();
  });

  it("录音期间周期性给出临时文本", async () => {
    transcribeMock.mockResolvedValue({ text: "正在识别" });
    const onPartial = vi.fn();
    const onFinal = vi.fn();
    const { result } = renderHook(() =>
      useVoiceInput({
        onPartial,
        onFinal,
        interimIntervalMs: 20,
        minInterimAudioMs: 0,
      }),
    );

    await act(async () => {
      await result.current.start();
    });

    await waitFor(() => {
      expect(onPartial).toHaveBeenCalledWith("正在识别");
    });
    expect(onFinal).not.toHaveBeenCalled();

    await act(async () => {
      result.current.cancel();
    });
  });

  it("取消录音时不调用转写", async () => {
    const onPartial = vi.fn();
    const onFinal = vi.fn();
    const { result } = renderHook(() =>
      useVoiceInput({ onPartial, onFinal }),
    );

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      result.current.cancel();
    });

    expect(transcribeMock).not.toHaveBeenCalled();
    expect(onFinal).not.toHaveBeenCalled();
    expect(result.current.isRecording).toBe(false);
  });

  it("没有麦克风权限时给出错误提示", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });
    const { result } = renderHook(() =>
      useVoiceInput({ onPartial: vi.fn(), onFinal: vi.fn() }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBeTruthy();
  });
});

describe("VoiceInputSettings 组件", () => {
  it("关闭时只保留开关，开启后展示配置项", async () => {
    const { VoiceInputSettings } = await import(
      "@/components/settings/VoiceInputSettings"
    );
    const onChange = vi.fn();
    const { rerender } = render(
      <VoiceInputSettings value={{ enabled: false }} onChange={onChange} />,
    );

    expect(screen.queryByLabelText("API 地址")).toBeNull();

    rerender(
      <VoiceInputSettings value={{ enabled: true }} onChange={onChange} />,
    );
    expect(screen.getByLabelText("API 地址")).toBeTruthy();
    expect(screen.getByLabelText("API Key")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("API 地址"), {
      target: { value: "https://api.example.com" },
    });
    fireEvent.blur(screen.getByLabelText("API 地址"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://api.example.com" }),
    );
  });
});
