import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { voiceApi } from "@/lib/api/voice";
import type { TFunction } from "i18next";

/** 录音状态机 */
export type VoiceInputStatus =
  | "idle"
  | "requesting" // 正在申请麦克风权限
  | "recording"
  | "transcribing" // 已停止录音，正在等待最终结果
  | "error";

interface UseVoiceInputOptions {
  /**
   * 录音过程中的临时识别结果（每次都是「从开口到此刻」的完整文本，调用方整体替换即可）。
   * 由定时切片转写产生，因此会有轻微延迟（约一个切片周期）。
   */
  onPartial: (text: string) => void;
  /** 停止录音后的最终文本（同样是从开口到结束的完整文本，可直接替换临时文本） */
  onFinal: (text: string) => void;
  /** 是否允许录音（离线 / 未选会话时禁用） */
  enabled?: boolean;
  /** 临时结果转写的间隔（毫秒） */
  interimIntervalMs?: number;
  /** 触发第一次临时转写所需的最短录音时长（毫秒） */
  minInterimAudioMs?: number;
}

interface UseVoiceInputResult {
  status: VoiceInputStatus;
  /** 录音时长（秒），仅 recording 时递增 */
  durationSec: number;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
  isRecording: boolean;
  isBusy: boolean;
}

/** 太短的切片识别质量差，至少攒够这么久再发一次临时转写 */
const MIN_INTERIM_AUDIO_MS = 1200;
/** 默认临时转写间隔：够快能「边说边出字」，又不至于把服务打爆 */
const DEFAULT_INTERIM_INTERVAL_MS = 2500;
/** MediaRecorder 的切片周期 */
const RECORDER_TIMESLICE_MS = 1000;

/** 仅保留浏览器实际能录的容器，优先 webm/opus（体积小），Safari 回退 mp4 */
function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("读取录音失败"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      // FileReader 返回 data:<mime>;base64,<data>，只取后面的部分
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * 聊天输入框的语音输入（准实时）。
 *
 * 录音期间每隔约 2.5s 把「当前已录的全部音频」发一次转写，结果通过 `onPartial`
 * 整体替换显示，所以看起来是边说边出字；停止录音后用 `onFinal` 收尾。
 *
 * 之所以每次都发全量音频而不是增量片段：WebM / MP4 的后续切片缺少容器头，
 * 单独发给解码器会失败；而「从头到现在的完整前缀」是合法文件，服务端能正常解码。
 *
 * 所有网络请求走 Tauri 命令，不在前端 fetch。
 */
export function useVoiceInput({
  onPartial,
  onFinal,
  enabled = true,
  interimIntervalMs = DEFAULT_INTERIM_INTERVAL_MS,
  minInterimAudioMs = MIN_INTERIM_AUDIO_MS,
}: UseVoiceInputOptions): UseVoiceInputResult {
  const { t } = useTranslation();
  const [status, setStatus] = useState<VoiceInputStatus>("idle");
  const [durationSec, setDurationSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const interimTimerRef = useRef<number | null>(null);
  /** 本次录音的开始时间戳，用于判断音频是否够长 */
  const startedAtRef = useRef(0);
  // 每次录音一个会话号，异步结果回来时用它判断是否已经过期
  const sessionRef = useRef(0);
  // 用户点了「取消」时，onstop 里不再转写
  const discardRef = useRef(false);
  // 临时转写是否正在进行 / 期间是否有新音频
  const interimBusyRef = useRef(false);
  const interimDirtyRef = useRef(false);

  // 回调用 ref 保存，避免它们变化导致 start/stop 重建
  const onPartialRef = useRef(onPartial);
  const onFinalRef = useRef(onFinal);
  const tRef = useRef<TFunction>(t);
  onPartialRef.current = onPartial;
  onFinalRef.current = onFinal;
  tRef.current = t;

  const cleanupRecorder = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (interimTimerRef.current !== null) {
      window.clearInterval(interimTimerRef.current);
      interimTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    interimBusyRef.current = false;
    interimDirtyRef.current = false;
  }, []);

  // 组件卸载时释放麦克风
  useEffect(() => {
    const sessionAtMount = sessionRef.current;
    return () => {
      discardRef.current = true;
      sessionRef.current += 1;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // ignore
        }
      }
      if (sessionAtMount === sessionRef.current - 1) cleanupRecorder();
    };
  }, [cleanupRecorder]);

  /** 把「从开口到此刻」的完整音频发一次转写，结果作为临时文本 */
  const runInterimRef = useRef<() => Promise<void>>(async () => {});
  const runInterim = useCallback(async () => {
    if (interimBusyRef.current) {
      interimDirtyRef.current = true;
      return;
    }
    const chunks = chunksRef.current;
    if (chunks.length === 0) return;

    const recordedMs = Date.now() - startedAtRef.current;
    if (recordedMs < minInterimAudioMs) return;

    const sid = sessionRef.current;
    const recorder = recorderRef.current;
    if (!recorder) return;
    const type = recorder.mimeType || "audio/webm";

    interimBusyRef.current = true;
    try {
      const base64 = await blobToBase64(new Blob(chunks, { type }));
      if (sessionRef.current !== sid) return; // 期间已停止/重启
      const result = await voiceApi.transcribe(type, base64);
      if (sessionRef.current !== sid) return;
      const text = (result.text ?? "").trim();
      if (text) onPartialRef.current(text);
    } catch (err) {
      // 临时结果失败不打扰用户，保持上一版文本即可；最终转写会给出真实错误
      console.debug("[VoiceInput] interim transcribe failed:", err);
    } finally {
      interimBusyRef.current = false;
      // 转写期间又攒了新音频，立刻补一次（走 ref 避免自引用）
      if (interimDirtyRef.current && sessionRef.current === sid) {
        interimDirtyRef.current = false;
        void runInterimRef.current();
      }
    }
  }, [minInterimAudioMs]);
  runInterimRef.current = runInterim;

  const start = useCallback(async () => {
    if (!enabled || status === "recording" || status === "transcribing") return;

    setError(null);
    discardRef.current = false;
    sessionRef.current += 1;
    const sid = sessionRef.current;

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError(
        t("hermes.chat.voiceUnavailable", {
          defaultValue: "当前环境不支持录音（无法访问麦克风）",
        }),
      );
      setStatus("error");
      return;
    }

    setStatus("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.warn("[VoiceInput] getUserMedia failed:", err);
      setError(
        t("hermes.chat.voicePermissionDenied", {
          defaultValue: "无法访问麦克风，请在系统设置中允许本应用使用麦克风",
        }),
      );
      setStatus("error");
      return;
    }

    if (sessionRef.current !== sid) {
      // 等待授权期间已经取消/重启
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch (err) {
      console.warn("[VoiceInput] MediaRecorder init failed:", err);
      stream.getTracks().forEach((track) => track.stop());
      setError(
        t("hermes.chat.voiceUnavailable", {
          defaultValue: "当前环境不支持录音（无法访问麦克风）",
        }),
      );
      setStatus("error");
      return;
    }

    streamRef.current = stream;
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const chunks = chunksRef.current;
      const recordedType = recorder.mimeType || mimeType || "audio/webm";
      const shouldDiscard = discardRef.current;
      cleanupRecorder();
      setDurationSec(0);

      if (shouldDiscard) {
        discardRef.current = false;
        setStatus("idle");
        return;
      }
      if (chunks.length === 0) {
        setStatus("idle");
        return;
      }

      setStatus("transcribing");
      const finalSid = sid;
      void blobToBase64(new Blob(chunks, { type: recordedType }))
        .then((base64) => voiceApi.transcribe(recordedType, base64))
        .then((result) => {
          if (sessionRef.current !== finalSid) return;
          const text = (result.text ?? "").trim();
          if (text) {
            onFinalRef.current(text);
            setStatus("idle");
            setError(null);
          } else {
            setStatus("idle");
            setError(
              tRef.current("hermes.chat.voiceEmpty", {
                defaultValue: "没有识别到语音内容",
              }),
            );
          }
        })
        .catch((err) => {
          if (sessionRef.current !== finalSid) return;
          console.warn("[VoiceInput] transcribe failed:", err);
          setStatus("error");
          setError(
            typeof err === "string"
              ? err
              : (err as Error)?.message || String(err),
          );
        });
    };

    // timeslice：每秒给一次音频片段，攒够一个间隔就发一次临时转写
    recorder.start(RECORDER_TIMESLICE_MS);
    setStatus("recording");
    setDurationSec(0);
    startedAtRef.current = Date.now();
    timerRef.current = window.setInterval(() => {
      setDurationSec((sec) => sec + 1);
    }, 1000);
    interimTimerRef.current = window.setInterval(() => {
      void runInterim();
    }, interimIntervalMs);
  }, [cleanupRecorder, enabled, interimIntervalMs, runInterim, status, t]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    discardRef.current = false;
    try {
      recorder.stop();
    } catch (err) {
      console.warn("[VoiceInput] stop failed:", err);
    }
  }, []);

  const cancel = useCallback(() => {
    sessionRef.current += 1;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanupRecorder();
      setStatus("idle");
      return;
    }
    discardRef.current = true;
    try {
      recorder.stop();
    } catch {
      cleanupRecorder();
      setStatus("idle");
    }
  }, [cleanupRecorder]);

  return {
    status,
    durationSec,
    error,
    start,
    stop,
    cancel,
    isRecording: status === "recording",
    isBusy: status === "requesting" || status === "transcribing",
  };
}
