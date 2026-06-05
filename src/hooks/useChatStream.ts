import { useCallback, useReducer, useRef } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";

export interface ToolActivity {
  tool: string;
  preview: string;
  status: "running" | "completed" | "error";
  duration?: number;
}

export interface ApprovalRequest {
  runId: string;
  tool: string;
  args: string;
}

interface RunStreamEvent {
  type: "delta" | "toolStarted" | "toolCompleted" | "approvalRequired" | "completed" | "failed" | "error";
  content?: string;
  tool?: string;
  preview?: string;
  duration?: number;
  error?: boolean;
  args?: string;
  output?: string;
  message?: string;
  runId?: string;
  sessionId?: string;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
}

export interface RunUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface StreamFile {
  filename: string;
  content: string;   // base64
  mimeType: string;
}

interface StreamOptions {
  input: string;
  files?: StreamFile[];
  attachments?: string[];
  model?: string;
  sessionId?: string;
  agentId?: string;
  apiServerPort?: number;
  apiServerKey?: string;
  onDelta: (text: string) => void;
  onToolStarted: (tool: string, preview: string) => void;
  onToolCompleted: (tool: string, duration: number, error: boolean) => void;
  onApprovalRequired: (approval: ApprovalRequest) => void;
  onCompleted: (output: string, runSessionId: string, usage?: RunUsage) => void;
  onError: (error: string) => void;
}

const MIN_WAITING_MS = 600;

export function useChatStream() {
  // useReducer gives a stable dispatch that React always processes synchronously
  // even in concurrent mode — unlike useState batching after await
  const [state, dispatch] = useReducer(
    (_: { isStreaming: boolean; isWaiting: boolean }, action: { isStreaming: boolean; isWaiting: boolean }) => action,
    { isStreaming: false, isWaiting: false },
  );
  const runIdRef = useRef<string | null>(null);
  const stopRequestedRef = useRef(false);
  const waitingStartRef = useRef<number>(0);
  const waitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearWaiting = useCallback(() => {
    const elapsed = Date.now() - waitingStartRef.current;
    const remaining = MIN_WAITING_MS - elapsed;
    if (remaining > 0) {
      waitingTimerRef.current = setTimeout(
        () => dispatch({ isStreaming: true, isWaiting: false }),
        remaining,
      );
    } else {
      dispatch({ isStreaming: true, isWaiting: false });
    }
  }, []);

  const sendRun = useCallback(async (options: StreamOptions) => {
    const { input, files, attachments, model, sessionId, agentId, apiServerPort, apiServerKey, onDelta, onToolStarted, onToolCompleted, onApprovalRequired, onCompleted, onError } = options;

    if (waitingTimerRef.current) {
      clearTimeout(waitingTimerRef.current);
      waitingTimerRef.current = null;
    }
    stopRequestedRef.current = false;
    waitingStartRef.current = Date.now();
    // Dispatch synchronously before any async work — React will schedule this
    // render immediately since we're not inside a transition
    dispatch({ isStreaming: true, isWaiting: true });

    try {
      await new Promise<void>((resolve, reject) => {
        const onEvent = new Channel<RunStreamEvent>();

        onEvent.onmessage = (event) => {
          switch (event.type) {
            case "delta":
              clearWaiting();
              if (event.content) onDelta(event.content);
              break;
            case "toolStarted":
              clearWaiting();
              onToolStarted(event.tool ?? "", event.preview ?? "");
              break;
            case "toolCompleted":
              onToolCompleted(event.tool ?? "", event.duration ?? 0, event.error ?? false);
              break;
            case "approvalRequired":
              onApprovalRequired({
                runId: runIdRef.current ?? "",
                tool: event.tool ?? "",
                args: event.args ?? "",
              });
              break;
            case "completed":
              clearWaiting();
              onCompleted(event.output ?? "", event.sessionId ?? "", {
                inputTokens: event.inputTokens ?? 0,
                outputTokens: event.outputTokens ?? 0,
                model: event.model ?? "",
              });
              resolve();
              break;
            case "failed":
              clearWaiting();
              onError(event.error ? String(event.error) : "Run failed");
              resolve();
              break;
            case "error":
              clearWaiting();
              onError(event.message ?? "Unknown error");
              resolve();
              break;
          }
        };

        invoke<{ runId: string }>("startChatRun", {
          request: {
            input,
            files: (files ?? []).map((f) => ({
              filename: f.filename,
              content: f.content,
              mimeType: f.mimeType,
            })),
            attachments: attachments ?? [],
            model: model ?? null,
            sessionId: sessionId ?? null,
            agentId: agentId ?? null,
            apiServerPort: apiServerPort ?? null,
            apiServerKey: apiServerKey ?? null,
          },
          onEvent,
        })
          .then((result) => {
            runIdRef.current = result.runId;
            // Stop was requested before the run ID was available — send it now
            if (stopRequestedRef.current) {
              void import("@/lib/api/chat").then(({ chatApi }) => chatApi.stopRun(result.runId));
            }
          })
          .catch((err) => {
            reject(err);
          });
      });
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      if (waitingTimerRef.current) {
        clearTimeout(waitingTimerRef.current);
        waitingTimerRef.current = null;
      }
      dispatch({ isStreaming: false, isWaiting: false });
      runIdRef.current = null;
      stopRequestedRef.current = false;
    }
  }, [clearWaiting]);

  const stop = useCallback(async () => {
    stopRequestedRef.current = true;
    if (runIdRef.current) {
      const { chatApi } = await import("@/lib/api/chat");
      await chatApi.stopRun(runIdRef.current);
    }
  }, []);

  return { sendRun, isStreaming: state.isStreaming, isWaiting: state.isWaiting, stop, runIdRef };
}
