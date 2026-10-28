/**
 * useSessionStreams — per-session stream state store
 *
 * Allows multiple chat sessions to run concurrently. Each session gets its
 * own slot in the map keyed by sessionId. All stream callbacks write to
 * that slot; the active-session view reads from it.
 */
import { useCallback, useRef, useState } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import type { ToolActivity, ApprovalRequest } from "./useChatStream";
import { chatApi } from "@/lib/api/chat";

export type { ToolActivity, ApprovalRequest };

export interface ArtifactFile {
  path: string;
  filename: string;
  sizeBytes: number;
}

export interface StreamGroup {
  id: number;
  tool: string;
  preview: string;
  status: "running" | "completed" | "error";
  duration?: number;
  startedAt: number;
  elapsedMs: number;
  text: string;
}

export interface SessionStreamState {
  isStreaming: boolean;
  isWaiting: boolean;
  isStopping: boolean;
  streamingContent: string;
  toolActivities: ToolActivity[];
  streamGroups: StreamGroup[];
  pendingApproval: ApprovalRequest | null;
  currentTool: string | null;
  streamTokens: number;
  hermesSessionId: string | null;
  groupIdCounter: number;
}

function emptyState(): SessionStreamState {
  return {
    isStreaming: false,
    isWaiting: false,
    isStopping: false,
    streamingContent: "",
    toolActivities: [],
    streamGroups: [],
    pendingApproval: null,
    currentTool: null,
    streamTokens: 0,
    hermesSessionId: null,
    groupIdCounter: 0,
  };
}

interface RunStreamEvent {
  type:
    | "delta"
    | "toolStarted"
    | "toolCompleted"
    | "approvalRequired"
    | "completed"
    | "failed"
    | "error";
  content?: string;
  tool?: string;
  preview?: string;
  duration?: number;
  error?: boolean;
  result?: string;
  args?: string;
  output?: string;
  message?: string;
  sessionId?: string;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  artifacts?: ArtifactFile[];
}

export interface SendRunOptions {
  sessionId: string; // DB session id (our key)
  input: string;
  files?: { filename: string; content: string; mimeType: string }[];
  attachments?: string[];
  model?: string;
  hermesSessionId?: string; // Hermes server session id (for context continuity)
  agentId?: string;
  apiServerPort?: number;
  apiServerKey?: string;
  onCompleted: (
    output: string,
    hermesSessionId: string,
    artifacts: ArtifactFile[],
  ) => void;
  onError: (err: string) => void;
  onUserCancelled: () => boolean;
  saveMessage: (
    sessionId: string,
    role: string,
    content: string,
  ) => Promise<void>;
}

const MIN_WAITING_MS = 600;
// Inactivity timeout: if no SSE event arrives for this long, treat as dead connection.
// Resets on every event so long-running agents are never killed mid-run.
// First-event window is shorter (60 s) to catch fast connection failures;
// subsequent window is longer (3 min) to tolerate slow tool calls.
const FIRST_EVENT_TIMEOUT_MS = 60 * 1000;
const INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000;

export function useSessionStreams() {
  // Map from sessionId → SessionStreamState
  const [statesMap, setStatesMap] = useState<Map<string, SessionStreamState>>(
    new Map(),
  );

  // Mutable refs for stop/cancel — keyed by sessionId
  const runIdRefs = useRef<Map<string, string | null>>(new Map());
  const stopPortRefs = useRef<Map<string, number | null>>(new Map());
  const stopKeyRefs = useRef<Map<string, string | null>>(new Map());
  const stopRequestedRefs = useRef<Map<string, boolean>>(new Map());
  const forceResolveRefs = useRef<Map<string, (() => void) | null>>(new Map());
  const waitingTimerRefs = useRef<
    Map<string, ReturnType<typeof setTimeout> | null>
  >(new Map());
  // Accumulated streaming text — kept in a ref so it can be read synchronously
  // in the completed handler without depending on async React state commits.
  const streamingContentRefs = useRef<Map<string, string>>(new Map());
  // Synchronous guard: true while a sendRun promise is active for this session.
  const isRunningRefs = useRef<Map<string, boolean>>(new Map());

  const getState = useCallback(
    (sessionId: string): SessionStreamState =>
      statesMap.get(sessionId) ?? emptyState(),
    [statesMap],
  );

  const updateState = useCallback(
    (
      sessionId: string,
      patch:
        | Partial<SessionStreamState>
        | ((prev: SessionStreamState) => Partial<SessionStreamState>),
    ) => {
      setStatesMap((prev) => {
        const current = prev.get(sessionId) ?? emptyState();
        const delta = typeof patch === "function" ? patch(current) : patch;
        const next = new Map(prev);
        next.set(sessionId, { ...current, ...delta });
        return next;
      });
    },
    [],
  );

  const clearSession = useCallback((sessionId: string) => {
    setStatesMap((prev) => {
      const next = new Map(prev);
      next.delete(sessionId);
      return next;
    });
  }, []);

  const sendRun = useCallback(
    async (opts: SendRunOptions) => {
      const {
        sessionId,
        input,
        files,
        attachments,
        model,
        hermesSessionId,
        agentId,
        apiServerPort,
        apiServerKey,
        onCompleted,
        onError,
        onUserCancelled,
        saveMessage,
      } = opts;

      // Cancel any existing waiting timer for this session
      const prevTimer = waitingTimerRefs.current.get(sessionId);
      if (prevTimer) clearTimeout(prevTimer);

      stopRequestedRefs.current.set(sessionId, false);
      stopPortRefs.current.set(sessionId, apiServerPort ?? null);
      stopKeyRefs.current.set(sessionId, apiServerKey ?? null);
      // Reset the synchronous streaming-content ref for this run
      streamingContentRefs.current.set(sessionId, "");
      isRunningRefs.current.set(sessionId, true);

      updateState(sessionId, {
        isStreaming: true,
        isWaiting: true,
        isStopping: false,
        streamingContent: "",
        toolActivities: [],
        streamGroups: [],
        currentTool: null,
        streamTokens: 0,
        pendingApproval: null,
      });

      const waitingStart = Date.now();

      const clearWaiting = () => {
        const timer = waitingTimerRefs.current.get(sessionId);
        if (timer) {
          clearTimeout(timer);
          waitingTimerRefs.current.set(sessionId, null);
        }
        const elapsed = Date.now() - waitingStart;
        const remaining = MIN_WAITING_MS - elapsed;
        if (remaining > 0) {
          const t = setTimeout(
            () => updateState(sessionId, { isWaiting: false }),
            remaining,
          );
          waitingTimerRefs.current.set(sessionId, t);
        } else {
          updateState(sessionId, { isWaiting: false });
        }
      };

      try {
        await new Promise<void>((resolve, reject) => {
          let resolved = false;
          const safeResolve = () => {
            if (!resolved) {
              resolved = true;
              clearInactivityTimer();
              resolve();
            }
          };
          forceResolveRefs.current.set(sessionId, safeResolve);

          // Inactivity-based timeout: resets on every SSE event.
          // First window is shorter to catch connection failures quickly.
          let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
          let firstEventReceived = false;
          const clearInactivityTimer = () => {
            if (inactivityTimer) {
              clearTimeout(inactivityTimer);
              inactivityTimer = null;
            }
          };
          const resetInactivityTimer = () => {
            clearInactivityTimer();
            const ms = firstEventReceived
              ? INACTIVITY_TIMEOUT_MS
              : FIRST_EVENT_TIMEOUT_MS;
            inactivityTimer = setTimeout(() => {
              if (!resolved) {
                onError("连接超时（服务无响应）");
                safeResolve();
              }
            }, ms);
          };
          resetInactivityTimer();

          const onEvent = new Channel<RunStreamEvent>();
          onEvent.onmessage = (event) => {
            if (resolved) return;
            // Reset inactivity timer on every received event
            firstEventReceived = true;
            resetInactivityTimer();
            switch (event.type) {
              case "delta":
                clearWaiting();
                if (event.content) {
                  // Keep ref in sync for synchronous read at completion time
                  streamingContentRefs.current.set(
                    sessionId,
                    (streamingContentRefs.current.get(sessionId) ?? "") +
                      event.content,
                  );
                  updateState(sessionId, (prev) => ({
                    streamingContent: prev.streamingContent + event.content,
                    streamTokens:
                      prev.streamTokens +
                      Math.ceil((event.content?.length ?? 0) / 4),
                    currentTool: null,
                    streamGroups:
                      prev.streamGroups.length === 0
                        ? prev.streamGroups
                        : (() => {
                            const last =
                              prev.streamGroups[prev.streamGroups.length - 1];
                            return [
                              ...prev.streamGroups.slice(0, -1),
                              {
                                ...last,
                                text: last.text + (event.content ?? ""),
                              },
                            ];
                          })(),
                  }));
                }
                break;
              case "toolStarted":
                clearWaiting();
                updateState(sessionId, (prev) => {
                  const newId = prev.groupIdCounter + 1;
                  return {
                    currentTool: event.tool ?? "",
                    groupIdCounter: newId,
                    toolActivities: [
                      ...prev.toolActivities,
                      {
                        tool: event.tool ?? "",
                        preview: event.preview ?? "",
                        status: "running" as const,
                      },
                    ],
                    streamGroups: [
                      ...prev.streamGroups,
                      {
                        id: newId,
                        tool: event.tool ?? "",
                        preview: event.preview ?? "",
                        status: "running" as const,
                        startedAt: Date.now(),
                        elapsedMs: 0,
                        text: "",
                      },
                    ],
                  };
                });
                break;
              case "toolCompleted":
                updateState(sessionId, (prev) => ({
                  currentTool: null,
                  toolActivities: prev.toolActivities.map((a) =>
                    a.tool === event.tool && a.status === "running"
                      ? {
                          ...a,
                          status: event.error
                            ? ("error" as const)
                            : ("completed" as const),
                          duration: event.duration,
                          result: event.result,
                        }
                      : a,
                  ),
                  streamGroups: prev.streamGroups.map((g) =>
                    g.tool === event.tool && g.status === "running"
                      ? {
                          ...g,
                          status: event.error
                            ? ("error" as const)
                            : ("completed" as const),
                          duration: event.duration,
                        }
                      : g,
                  ),
                }));
                break;
              case "approvalRequired": {
                const notifyApproval = () => {
                  const runId = runIdRefs.current.get(sessionId);
                  if (runId) {
                    updateState(sessionId, {
                      pendingApproval: {
                        runId,
                        tool: event.tool ?? "",
                        args: event.args ?? "",
                      },
                    });
                  } else {
                    setTimeout(notifyApproval, 50);
                  }
                };
                notifyApproval();
                break;
              }
              case "completed": {
                clearWaiting();
                const output = event.output ?? "";
                const hSid = event.sessionId ?? "";
                const artifacts = event.artifacts ?? [];
                (async () => {
                  if (onUserCancelled()) {
                    safeResolve();
                    return;
                  }
                  // Read accumulated content synchronously from ref (React state
                  // commits are async, so we cannot rely on statesMap here).
                  const capturedContent =
                    streamingContentRefs.current.get(sessionId) || output;
                  let capturedGroups: StreamGroup[] = [];
                  updateState(sessionId, (prev) => {
                    capturedGroups = prev.streamGroups.map((g) =>
                      g.status === "running"
                        ? { ...g, status: "completed" as const }
                        : g,
                    );
                    return {
                      streamingContent: "",
                      toolActivities: [],
                      isStreaming: false,
                      isWaiting: false,
                      hermesSessionId: hSid || prev.hermesSessionId,
                      streamGroups: capturedGroups,
                    };
                  });
                  // Save messages outside state updater (async side-effects must
                  // not live inside setState callbacks).
                  if (capturedContent) {
                    await saveMessage(sessionId, "assistant", capturedContent);
                    if (capturedGroups.length > 0) {
                      await saveMessage(
                        sessionId,
                        "timeline",
                        JSON.stringify(capturedGroups),
                      );
                    }
                  }
                  if (artifacts.length > 0) {
                    await saveMessage(
                      sessionId,
                      "artifacts",
                      JSON.stringify(artifacts),
                    );
                  }
                  onCompleted(capturedContent, hSid, artifacts);
                  safeResolve();
                })();
                break;
              }
              case "failed":
                clearWaiting();
                onError(event.error ? String(event.error) : "Run failed");
                safeResolve();
                break;
              case "error":
                clearWaiting();
                onError(event.message ?? "Unknown error");
                safeResolve();
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
              sessionId: hermesSessionId ?? null,
              agentId: agentId ?? null,
              apiServerPort: apiServerPort ?? null,
              apiServerKey: apiServerKey ?? null,
            },
            onEvent,
          })
            .then((result) => {
              runIdRefs.current.set(sessionId, result.runId);
              if (stopRequestedRefs.current.get(sessionId)) {
                void chatApi.stopRun(
                  result.runId,
                  apiServerPort ?? null,
                  apiServerKey ?? null,
                );
              }
            })
            .catch((err) => reject(err));
        });
      } catch (err: unknown) {
        onError(err instanceof Error ? err.message : String(err));
      } finally {
        const timer = waitingTimerRefs.current.get(sessionId);
        if (timer) clearTimeout(timer);
        waitingTimerRefs.current.set(sessionId, null);
        forceResolveRefs.current.set(sessionId, null);
        runIdRefs.current.set(sessionId, null);
        stopRequestedRefs.current.set(sessionId, false);
        streamingContentRefs.current.delete(sessionId);
        isRunningRefs.current.set(sessionId, false);
        updateState(sessionId, {
          isStreaming: false,
          isWaiting: false,
          isStopping: false,
        });
      }
    },
    [updateState],
  );

  const stopSession = useCallback(
    async (
      sessionId: string,
      apiServerPort?: number | null,
      apiServerKey?: string | null,
    ) => {
      stopRequestedRefs.current.set(sessionId, true);
      updateState(sessionId, { isStopping: true });
      const runId = runIdRefs.current.get(sessionId);
      if (runId) {
        await chatApi
          .stopRun(runId, apiServerPort ?? null, apiServerKey ?? null)
          .catch(() => {});
      }
      const resolve = forceResolveRefs.current.get(sessionId);
      if (resolve) {
        resolve();
        forceResolveRefs.current.set(sessionId, null);
      }
    },
    [updateState],
  );

  const getRunId = useCallback(
    (sessionId: string) => runIdRefs.current.get(sessionId) ?? null,
    [],
  );

  const isRunning = useCallback(
    (sessionId: string) => isRunningRefs.current.get(sessionId) ?? false,
    [],
  );

  const setHermesSessionId = useCallback(
    (sessionId: string, hermesSessionId: string | null) =>
      updateState(sessionId, { hermesSessionId }),
    [updateState],
  );

  const setStreamGroups = useCallback(
    (
      sessionId: string,
      updater: StreamGroup[] | ((prev: StreamGroup[]) => StreamGroup[]),
    ) =>
      updateState(sessionId, (prev) => ({
        streamGroups:
          typeof updater === "function" ? updater(prev.streamGroups) : updater,
      })),
    [updateState],
  );

  const setPendingApproval = useCallback(
    (sessionId: string, approval: ApprovalRequest | null) =>
      updateState(sessionId, { pendingApproval: approval }),
    [updateState],
  );

  return {
    getState,
    sendRun,
    stopSession,
    clearSession,
    getRunId,
    isRunning,
    setHermesSessionId,
    setStreamGroups,
    setPendingApproval,
    statesMap,
  };
}
