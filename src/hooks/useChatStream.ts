import { useCallback, useRef, useState } from "react";
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
}

interface StreamOptions {
  input: string;
  model?: string;
  sessionId?: string;
  onDelta: (text: string) => void;
  onToolStarted: (tool: string, preview: string) => void;
  onToolCompleted: (tool: string, duration: number, error: boolean) => void;
  onApprovalRequired: (approval: ApprovalRequest) => void;
  onCompleted: (output: string, runSessionId: string) => void;
  onError: (error: string) => void;
}

export function useChatStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const runIdRef = useRef<string | null>(null);
  const stopRequestedRef = useRef(false);

  const sendRun = useCallback(async (options: StreamOptions) => {
    const { input, model, sessionId, onDelta, onToolStarted, onToolCompleted, onApprovalRequired, onCompleted, onError } = options;

    stopRequestedRef.current = false;
    setIsStreaming(true);

    try {
      await new Promise<void>((resolve, reject) => {
        const onEvent = new Channel<RunStreamEvent>();

        onEvent.onmessage = (event) => {
          switch (event.type) {
            case "delta":
              if (event.content) onDelta(event.content);
              break;
            case "toolStarted":
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
              onCompleted(event.output ?? "", event.sessionId ?? "");
              resolve();
              break;
            case "failed":
              onError(event.error ? String(event.error) : "Run failed");
              resolve();
              break;
            case "error":
              onError(event.message ?? "Unknown error");
              resolve();
              break;
          }
        };

        invoke<{ runId: string }>("startChatRun", {
          request: {
            input,
            model: model ?? null,
            sessionId: sessionId ?? null,
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
      setIsStreaming(false);
      runIdRef.current = null;
      stopRequestedRef.current = false;
    }
  }, []);

  const stop = useCallback(async () => {
    stopRequestedRef.current = true;
    if (runIdRef.current) {
      const { chatApi } = await import("@/lib/api/chat");
      await chatApi.stopRun(runIdRef.current);
    }
  }, []);

  return { sendRun, isStreaming, stop, runIdRef };
}
