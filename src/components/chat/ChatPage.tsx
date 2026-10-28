import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  MessageSquare,
  Clock,
  Trash2,
  ChevronUp,
  ChevronDown,
  Download,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import {
  chatKeys,
  useChatStatus,
  useChatModels,
  useChatSessions,
  useChatMessages,
  useCreateChatSession,
  useDeleteChatSession,
  useUpdateChatSession,
  useSaveChatMessage,
  useDeleteChatMessage,
  useHermesAgents,
} from "@/hooks/useHermesChat";
import { useInstalledSkills, useToggleSkillFavorite } from "@/hooks/useSkills";
import { type StreamFile } from "@/hooks/useChatStream";
import { useSessionStreams } from "@/hooks/useSessionStreams";
import { chatApi } from "@/lib/api/chat";
import { formatSessionAsMarkdown } from "@/lib/chatExport";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { compressContext } from "@/lib/contextCompression";
import { ChatSidebar } from "./ChatSidebar";
import type { SidebarTab } from "./ChatSidebar";
import { CronPage, cronKeys } from "@/components/cron/CronPage";
import { ChatMessageBubble } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ChatMarkdownPreview } from "./ChatMarkdownPreview";
import { ApprovalCard } from "./ApprovalCard";
import { ScrollArea } from "@/components/ui/scroll-area";

// Collapsed batch of consecutive tool calls with no text between them
function BatchToolRow({
  groups,
  allDone,
  hasRunning,
  totalDuration,
  fmtSecs,
  hasLineBelow,
}: {
  groups: {
    id: number;
    tool: string;
    preview: string;
    status: string;
    duration?: number;
    elapsedMs: number;
  }[];
  allDone: boolean;
  hasRunning: boolean;
  totalDuration: number;
  fmtSecs: (s: number) => string;
  hasLineBelow: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  if (expanded) {
    return (
      <div>
        {groups.map((g, i) => {
          const elapsed =
            g.status === "running"
              ? fmtSecs(g.elapsedMs / 1000)
              : g.duration !== undefined
                ? fmtSecs(g.duration)
                : null;
          return (
            <div key={g.id} className="flex gap-2">
              <div
                className="flex flex-col items-center pt-1 shrink-0"
                style={{ width: 20 }}
              >
                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border ${
                    g.status === "running"
                      ? "border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20"
                      : g.status === "error"
                        ? "border-red-400 bg-red-50 dark:bg-red-900/20"
                        : "border-green-400 bg-green-50 dark:bg-green-900/20"
                  }`}
                >
                  {g.status === "running" ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                  ) : g.status === "error" ? (
                    <span className="text-red-500 text-[8px] font-bold">✕</span>
                  ) : (
                    <span className="text-green-500 text-[8px] font-bold">
                      ✓
                    </span>
                  )}
                </div>
                {(i < groups.length - 1 || hasLineBelow) && (
                  <div
                    className="w-px flex-1 bg-border mt-0.5"
                    style={{ minHeight: 8 }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0 pb-0">
                <div className="flex items-center gap-0.5 text-xs py-0">
                  <span className="font-medium text-foreground">{g.tool}</span>
                  {elapsed && (
                    <span className="text-muted-foreground/60 shrink-0 ml-1.5">
                      {elapsed}
                    </span>
                  )}
                  {g.preview && (
                    <span className="text-muted-foreground/70 truncate max-w-[300px] font-mono ml-2">
                      {g.preview}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <button
          type="button"
          className="ml-7 text-[10px] text-muted-foreground/60 hover:text-muted-foreground"
          onClick={() => setExpanded(false)}
        >
          收起
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <div
        className="flex flex-col items-center pt-1 shrink-0"
        style={{ width: 20 }}
      >
        <div
          className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border ${
            hasRunning
              ? "border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20"
              : allDone
                ? "border-green-400 bg-green-50 dark:bg-green-900/20"
                : "border-red-400 bg-red-50 dark:bg-red-900/20"
          }`}
        >
          {hasRunning ? (
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          ) : allDone ? (
            <span className="text-green-500 text-[8px] font-bold">✓</span>
          ) : (
            <span className="text-red-500 text-[8px] font-bold">✕</span>
          )}
        </div>
        {hasLineBelow && (
          <div
            className="w-px flex-1 bg-border mt-0.5"
            style={{ minHeight: 8 }}
          />
        )}
      </div>
      <div className="flex-1 min-w-0 pb-0">
        <button
          type="button"
          className="flex items-center gap-0.5 text-xs py-0 hover:opacity-80 w-full text-left"
          onClick={() => setExpanded(true)}
        >
          <span className="font-medium text-foreground">
            {groups.map((g) => g.tool).join(", ")}
          </span>
          {groups.length > 1 && (
            <span className="text-muted-foreground/40 text-[10px]">
              ×{groups.length}
            </span>
          )}
          <span className="text-muted-foreground/60 shrink-0 ml-1.5">
            {fmtSecs(totalDuration)}
          </span>
        </button>
      </div>
    </div>
  );
}

interface ChatPageProps {
  selectedModel: string;
  selectedAgentId: string;
  selectedAgentPort: number | null;
  selectedAgentKey: string | null;
  onSelectAgent?: (agentId: string, port?: number, key?: string) => void;
  /** 打开 设置 → 通用（语音输入配置入口） */
  onOpenSettings?: () => void;
}

export function ChatPage({
  selectedModel,
  selectedAgentId,
  selectedAgentPort,
  selectedAgentKey,
  onSelectAgent,
  onOpenSettings,
}: ChatPageProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Per-session stream store — declared first so allProcessingSessionIds can reference it
  const sessionStreams = useSessionStreams();

  const [processingSessionIds, setProcessingSessionIds] = useState<Set<string>>(
    new Set(),
  );

  // Derive all-session processing set for sidebar spinners
  const allProcessingSessionIds = useMemo(() => {
    const ids = new Set(processingSessionIds);
    sessionStreams.statesMap.forEach((state, sid) => {
      if (state.isStreaming || state.isWaiting) ids.add(sid);
    });
    return ids;
  }, [processingSessionIds, sessionStreams.statesMap]);
  const [, setStreamStartTime] = useState<number | null>(null);
  const [elapsedSecs, setElapsedSecs] = useState(0);

  // Stream groups type (mirrors useSessionStreams.StreamGroup)
  interface StreamGroup {
    id: number;
    tool: string;
    preview: string;
    status: "running" | "completed" | "error";
    duration?: number;
    startedAt: number;
    elapsedMs: number;
    text: string;
  }
  const isLiveRef = useRef(false);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("chat");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [areaMenu, setAreaMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
  const areaMenuRef = useRef<HTMLDivElement>(null);
  const [generatingSummaryId, setGeneratingSummaryId] = useState<string | null>(
    null,
  );
  const [dailyReportOpen, setDailyReportOpen] = useState(false);
  const [alwaysAllowedTools, setAlwaysAllowedTools] = useState<Set<string>>(
    new Set(),
  );
  const [dailyReportDate, setDailyReportDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [dailyReportContent, setDailyReportContent] = useState<string | null>(
    null,
  );
  const [dailyReportLoading, setDailyReportLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollBottomRef = useRef<HTMLDivElement>(null);

  const { data: status } = useChatStatus(true);
  const { data: chatModels = [] } = useChatModels(
    selectedAgentId,
    selectedAgentPort,
    selectedAgentKey,
  );
  const { data: agents = [] } = useHermesAgents();
  const { data: installedSkills = [] } = useInstalledSkills(selectedAgentId);
  const favoriteSkills = installedSkills.filter((s) => s.isFavorite);
  const toggleFavoriteMutation = useToggleSkillFavorite(
    selectedAgentId ?? "default",
  );
  const { data: sessions = [] } = useChatSessions(selectedAgentId);
  const { data: allMessages = [] } = useChatMessages(activeSessionId);
  const messages = allMessages.filter(
    (m) => m.role !== "timeline" && m.role !== "artifacts",
  );
  const dbTimeline = allMessages.filter((m) => m.role === "timeline");
  // Map each assistant message id → its following artifacts (by position in allMessages)
  const artifactsMap = useMemo(() => {
    const map = new Map<
      string,
      import("@/hooks/useSessionStreams").ArtifactFile[]
    >();
    for (let i = 0; i < allMessages.length - 1; i++) {
      const msg = allMessages[i];
      const next = allMessages[i + 1];
      if (msg.role === "assistant" && next.role === "artifacts") {
        try {
          map.set(msg.id, JSON.parse(next.content));
        } catch {
          /* ignore */
        }
      }
    }
    return map;
  }, [allMessages]);

  const previewMarkdown = useMemo(() => {
    if (!previewOpen) return "";
    const session = sessions.find((s) => s.id === activeSessionId);
    const modelName = (session?.model ?? selectedModel ?? "")
      .replace(/^custom_[^:]+:/, "")
      .replace("__default__", "");
    return formatSessionAsMarkdown(
      session?.title ?? null,
      modelName || null,
      messages,
    );
  }, [previewOpen, activeSessionId, messages, sessions, selectedModel]);
  const createSession = useCreateChatSession();
  const deleteSession = useDeleteChatSession();
  const updateSession = useUpdateChatSession();
  const saveMessage = useSaveChatMessage();
  const deleteMessage = useDeleteChatMessage(activeSessionId);
  const userCancelledRef = useRef(false);

  const activeStream = sessionStreams.getState(activeSessionId ?? "");
  const isStreaming = activeStream.isStreaming;
  const isWaiting = activeStream.isWaiting;
  const isStopping = activeStream.isStopping;
  const isSending =
    processingSessionIds.has(activeSessionId ?? "") &&
    !isStreaming &&
    !isWaiting;
  const streamingContent = activeStream.streamingContent;
  const toolActivities = activeStream.toolActivities;
  const streamGroups = activeStream.streamGroups as StreamGroup[];
  const currentTool = activeStream.currentTool;
  const streamTokens = activeStream.streamTokens;
  const pendingApproval = activeStream.pendingApproval;
  const hermesSessionId = activeStream.hermesSessionId;
  const runIdRef = { current: sessionStreams.getRunId(activeSessionId ?? "") };

  const handleStop = useCallback(() => {
    userCancelledRef.current = true;
    if (!activeSessionId) return;

    // Capture runId before stopSession clears it
    const runId = sessionStreams.getRunId(activeSessionId);
    void sessionStreams.stopSession(
      activeSessionId,
      selectedAgentPort,
      selectedAgentKey,
    );
    // Clear server-side session so the next message starts a fresh context
    sessionStreams.setHermesSessionId(activeSessionId, null);

    if (!runId) return;

    // Poll in background until the run reaches a terminal state
    const TERMINAL = new Set([
      "completed",
      "failed",
      "cancelled",
      "interrupted",
    ]);
    const POLL_INTERVAL_MS = 1000;
    const POLL_TIMEOUT_MS = 30000;
    const started = Date.now();

    const poll = async () => {
      while (Date.now() - started < POLL_TIMEOUT_MS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        try {
          const info = await chatApi.getRunStatus(
            runId,
            selectedAgentPort,
            selectedAgentKey,
          );
          const s = String(info.status ?? "");
          if (TERMINAL.has(s)) {
            toast.success(
              t("hermes.chat.runStopped", { defaultValue: "任务已停止" }),
            );
            return;
          }
        } catch {
          // ignore transient poll errors
        }
      }
      // Still not in terminal state after timeout
      toast.warning(
        t("hermes.chat.stopTimeout", {
          defaultValue:
            "停止请求已发送，agent 仍在处理中。如长时间未停止，可重启 gateway 强制中断所有进行中的任务。",
        }),
      );
    };
    void poll();
  }, [activeSessionId, selectedAgentPort, selectedAgentKey, sessionStreams, t]);

  const isOnline = status?.online ?? false;

  const activeContextWindow = (() => {
    const modelId = selectedModel
      ?.replace(/^custom_[^:]+:/, "")
      .replace("__default__", "");
    const model = chatModels.find((m) => m.id === modelId);
    return model?.contextLength ?? 100000;
  })();

  const activeModelSupportsVision = (() => {
    const modelId = selectedModel
      ?.replace(/^custom_[^:]+:/, "")
      .replace("__default__", "");
    const model = chatModels.find((m) => m.id === modelId);
    // default model: unknown, optimistically allow vision
    return model?.supportsVision ?? true;
  })();

  // Auto-select first session
  useEffect(() => {
    if (!activeSessionId && sessions.length > 0) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  // Reset active session when switching agent
  useEffect(() => {
    setActiveSessionId(null);
  }, [selectedAgentId]);

  // Reset Hermes session when switching chat sessions or model
  useEffect(() => {
    if (activeSessionId)
      sessionStreams.setHermesSessionId(activeSessionId, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  useEffect(() => {
    if (activeSessionId)
      sessionStreams.setHermesSessionId(activeSessionId, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel]);

  // Tick elapsed time for running stream groups in ALL active sessions
  useEffect(() => {
    const id = setInterval(() => {
      sessionStreams.statesMap.forEach((state, sid) => {
        if (state.streamGroups.some((g) => g.status === "running")) {
          sessionStreams.setStreamGroups(sid, (prev) =>
            prev.map((g) =>
              g.status === "running"
                ? { ...g, elapsedMs: Date.now() - g.startedAt }
                : g,
            ),
          );
        }
      });
    }, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore streamGroups from DB when messages load (latest timeline row wins)
  useEffect(() => {
    if (isLiveRef.current) return;
    if (!activeSessionId) return;
    if (dbTimeline.length === 0) {
      sessionStreams.setStreamGroups(activeSessionId, []);
      return;
    }
    const latest = dbTimeline[dbTimeline.length - 1];
    try {
      const groups = JSON.parse(latest.content) as StreamGroup[];
      sessionStreams.setStreamGroups(activeSessionId, groups);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, dbTimeline[dbTimeline.length - 1]?.id]);

  // Elapsed timer during streaming
  useEffect(() => {
    if (!isStreaming && !isWaiting && !isSending) return;
    const start = Date.now();
    setStreamStartTime(start);
    setElapsedSecs(0);
    const id = setInterval(() => {
      setElapsedSecs(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isStreaming, isWaiting, isSending]);

  // Track whether user has scrolled up manually
  const userScrolledUpRef = useRef(false);
  const inputResizingRef = useRef(false);

  useEffect(() => {
    const el = scrollRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement | null;
    if (!el) return;
    const onScroll = () => {
      // Ignore scroll events caused by input resize (viewport shrink moves scrollTop)
      if (inputResizingRef.current) return;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      userScrolledUpRef.current = !atBottom;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll to bottom when switching sessions (always) or streaming new content (only if at bottom)
  useEffect(() => {
    userScrolledUpRef.current = false;
    scrollBottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [activeSessionId]);

  useEffect(() => {
    if (!userScrolledUpRef.current) {
      scrollBottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [messages]);

  useEffect(() => {
    if (!userScrolledUpRef.current) {
      scrollBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [streamingContent, toolActivities, isWaiting, isStreaming, isSending]);

  const handleNewSession = useCallback(async () => {
    const id = crypto.randomUUID();
    await createSession.mutateAsync({ id, agentId: selectedAgentId });
    setActiveSessionId(id);
  }, [createSession, selectedAgentId]);

  const handleDeleteSession = useCallback(
    async (id: string) => {
      await deleteSession.mutateAsync(id);
      if (activeSessionId === id) {
        setActiveSessionId(null);
      }
    },
    [deleteSession, activeSessionId],
  );

  const handleRenameSession = useCallback(
    async (id: string, title: string) => {
      await updateSession.mutateAsync({ sessionId: id, title });
    },
    [updateSession],
  );

  const doSendToAgent = useCallback(
    async (text: string, files: import("@/types").ChatFileRef[] = []) => {
      if (!isOnline || !activeSessionId) return;
      // Prevent a new run while the previous one is still winding down.
      // This guards the race between stopSession + new doSendToAgent call.
      if (sessionStreams.isRunning(activeSessionId)) return;

      // Upload all files to /v1/artifacts first (images and non-images).
      // Key is optional — some agents run without auth.
      const pickerPort = selectedAgentPort;
      const pickerKey = selectedAgentKey ?? "";
      const artifactInfos: {
        filename: string;
        artifact_id: string;
        download_path: string;
        sourcePath?: string;
      }[] = [];
      if (pickerPort) {
        for (const f of files) {
          try {
            const opts = f.sourcePath
              ? { filePath: f.sourcePath }
              : { base64Content: f.content };
            const result = await chatApi.uploadArtifact(
              pickerPort,
              pickerKey,
              f.filename,
              f.mimeType,
              opts,
            );
            artifactInfos.push({
              filename: result.filename,
              artifact_id: result.artifact_id,
              download_path: result.download_path,
              sourcePath: f.sourcePath,
            });
          } catch {
            toast.warning(
              t("hermes.chat.artifactUploadFailed", {
                filename: f.filename,
                defaultValue: `附件上传失败: ${f.filename}，将尝试内联发送`,
              }),
            );
          }
        }
      }

      // Files successfully uploaded → pass local sourcePath to /v1/runs as attachments
      // (download_path is an HTTP path; attachments expects local filesystem paths)
      // Images not uploaded → send base64 via vision content parts (fallback)
      // Non-images not uploaded → inline as <file> text blocks (fallback)
      const uploadedFilenames = new Set(artifactInfos.map((a) => a.filename));

      // Collect local source paths to pass as attachments to /v1/runs
      const attachmentPaths: string[] = artifactInfos
        .filter((a) => a.sourcePath)
        .map((a) => a.sourcePath!);

      const pastedImageFiles: StreamFile[] = activeModelSupportsVision
        ? files
            .filter(
              (f) =>
                !uploadedFilenames.has(f.filename) &&
                f.mimeType?.startsWith("image/"),
            )
            .map((f) => ({
              filename: f.filename,
              content: f.content,
              mimeType: f.mimeType,
            }))
        : [];

      // Non-image files without a successful artifact upload → inline as <file> text blocks
      const inlineFiles = files.filter(
        (f) =>
          !f.mimeType?.startsWith("image/") &&
          f.content &&
          !uploadedFilenames.has(f.filename),
      );
      const fileBlocks =
        inlineFiles.length > 0
          ? inlineFiles
              .map((f) => `<file name="${f.filename}">\n${f.content}\n</file>`)
              .join("\n\n")
          : "";

      // Artifact hint lines appended to user message
      const artifactHints =
        artifactInfos.length > 0
          ? artifactInfos
              .map((a) => {
                const parts = [
                  `文件已上传，文件名: ${a.filename}，artifact_id: ${a.artifact_id}`,
                ];
                if (a.sourcePath) parts.push(`本地路径: ${a.sourcePath}`);
                if (a.download_path)
                  parts.push(`download_path: ${a.download_path}`);
                return parts.join("，");
              })
              .join("\n")
          : "";

      // Strip [filename] placeholders for inlined AND uploaded files
      let userText = text;
      for (const f of [
        ...inlineFiles,
        ...files.filter((f) =>
          artifactInfos.some((a) => a.filename === f.filename),
        ),
      ]) {
        const escaped = f.filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        userText = userText
          .replace(new RegExp(`\\s*\\[${escaped}\\]\\s*`, "g"), " ")
          .trim();
      }
      const fullText = [fileBlocks, userText, artifactHints]
        .filter(Boolean)
        .join("\n\n");

      const fileRefsForDb =
        files.length > 0
          ? JSON.stringify(
              files.map(({ filename, mimeType, sizeBytes, sourcePath }) => ({
                filename,
                mimeType,
                sizeBytes,
                ...(sourcePath ? { sourcePath } : {}),
              })),
            )
          : null;

      const userMsgId = crypto.randomUUID();
      await saveMessage.mutateAsync({
        sessionId: activeSessionId,
        message: {
          id: userMsgId,
          role: "user",
          content: text,
          fileRefs: fileRefsForDb,
        },
      });

      setTimelineCollapsed(false);
      isLiveRef.current = true;
      setProcessingSessionIds((prev) => new Set(prev).add(activeSessionId));

      const hermesModel =
        selectedModel && selectedModel !== "__default__"
          ? selectedModel.replace(/^custom_[^:]+:/, "")
          : undefined;

      const { compressedInput, wasCompressed, droppedCount } = compressContext(
        messages,
        fullText,
        activeContextWindow,
      );
      if (wasCompressed) {
        toast.info(
          t("hermes.chat.contextCompressed", {
            count: droppedCount,
            defaultValue: `上下文过长，已省略最旧的 ${droppedCount} 条消息`,
          }),
        );
      }

      userCancelledRef.current = false;
      const MAX_RETRIES = 3;
      let attempt = 0;

      // Capture session-local state for this run
      const runSessionId = activeSessionId;

      while (attempt < MAX_RETRIES) {
        if (userCancelledRef.current) break;
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 1500 * attempt));
          toast.info(
            t("hermes.chat.retrying", {
              attempt,
              max: MAX_RETRIES,
              defaultValue: `请求失败，正在重试 (${attempt}/${MAX_RETRIES})...`,
            }),
          );
        }

        let succeeded = false;
        let lastError = "";

        const useSession = !wasCompressed && !!hermesSessionId;
        await sessionStreams.sendRun({
          sessionId: runSessionId,
          input: useSession ? fullText : compressedInput,
          files: pastedImageFiles.length > 0 ? pastedImageFiles : undefined,
          attachments: attachmentPaths.length > 0 ? attachmentPaths : undefined,
          model: hermesModel,
          hermesSessionId: useSession ? hermesSessionId : undefined,
          agentId: selectedAgentId ?? undefined,
          apiServerPort: selectedAgentPort ?? undefined,
          apiServerKey: selectedAgentKey ?? undefined,
          onCompleted: async (output, runHermesSid, _artifacts) => {
            if (userCancelledRef.current) {
              succeeded = true;
              return;
            }
            if (!output) {
              lastError = t("hermes.chat.emptyResponse", {
                defaultValue: "服务器无返回内容",
              });
              return;
            }
            succeeded = true;
            isLiveRef.current = false;
            setProcessingSessionIds((prev) => {
              const s = new Set(prev);
              s.delete(runSessionId);
              return s;
            });
            if (runHermesSid)
              sessionStreams.setHermesSessionId(runSessionId, runHermesSid);
            if (messages.length === 0) {
              const titleBase = text || files.map((f) => f.filename).join(", ");
              const title =
                titleBase.slice(0, 50) + (titleBase.length > 50 ? "..." : "");
              await chatApi.updateSession(runSessionId, title);
            }
          },
          onError: (err) => {
            lastError = err;
          },
          onUserCancelled: () => userCancelledRef.current,
          saveMessage: async (sid, role, content) => {
            const msgId = crypto.randomUUID();
            await saveMessage.mutateAsync({
              sessionId: sid,
              message: { id: msgId, role, content },
            });
            if (
              role === "assistant" ||
              role === "timeline" ||
              role === "artifacts"
            ) {
              void queryClient.invalidateQueries({
                queryKey: chatKeys.messages(sid),
              });
            }
          },
        });

        if (succeeded) return;
        attempt++;

        if (!userCancelledRef.current && lastError) {
          if (attempt >= MAX_RETRIES) {
            const errMsgId = crypto.randomUUID();
            await saveMessage.mutateAsync({
              sessionId: runSessionId,
              message: {
                id: errMsgId,
                role: "assistant",
                content: `**错误**: ${lastError}`,
              },
            });
          }
        }
      }

      isLiveRef.current = false;
      setProcessingSessionIds((prev) => {
        const s = new Set(prev);
        s.delete(runSessionId);
        return s;
      });
    },
    [
      isOnline,
      activeSessionId,
      messages,
      selectedModel,
      selectedAgentId,
      selectedAgentPort,
      activeContextWindow,
      hermesSessionId,
      sessionStreams,
      saveMessage,
      queryClient,
      t,
    ],
  );

  const handleClearMessages = useCallback(async () => {
    if (!activeSessionId) return;
    sessionStreams.setHermesSessionId(activeSessionId, null);
    await chatApi.clearMessages(activeSessionId);
    void queryClient.invalidateQueries({
      queryKey: chatKeys.messages(activeSessionId),
    });
    toast.success(t("hermes.chat.newSession"));
  }, [activeSessionId, queryClient, t, sessionStreams]);

  const handleExportSession = useCallback(
    async (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      let sessionMessages: import("@/types").ChatMessage[];
      if (sessionId === activeSessionId) {
        sessionMessages = messages;
      } else {
        const allMsgs = await chatApi.getMessages(sessionId);
        sessionMessages = allMsgs.filter((m) => m.role !== "timeline");
      }
      const modelName = (session?.model ?? selectedModel ?? "")
        .replace(/^custom_[^:]+:/, "")
        .replace("__default__", "");

      const content = formatSessionAsMarkdown(
        session?.title ?? null,
        modelName || null,
        sessionMessages,
      );

      const title =
        session?.title ||
        t("hermes.chat.untitled", { defaultValue: "未命名聊天" });
      const safeTitle = title.replace(/[/\\:*?"<>|]/g, "_");
      const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
      const defaultFilename = `${safeTitle}_${ts}.md`;

      try {
        const filePath = await save({
          defaultPath: defaultFilename,
          filters: [{ name: "Markdown", extensions: ["md"] }],
        });
        if (!filePath) return;

        await writeTextFile(filePath, content);
        toast.success(
          t("hermes.chat.exportSuccess", { defaultValue: "会话已导出" }),
        );
      } catch (err) {
        console.error("[export]", err);
        toast.error(
          t("hermes.chat.exportFailed", { defaultValue: "导出失败" }),
        );
      }
    },
    [sessions, activeSessionId, messages, selectedModel, t],
  );

  const handleGenerateSummary = useCallback(
    async (sessionId: string) => {
      setGeneratingSummaryId(sessionId);
      try {
        const session = sessions.find((s) => s.id === sessionId);
        let sessionMessages: import("@/types").ChatMessage[];
        if (sessionId === activeSessionId) {
          sessionMessages = messages.filter((m) => m.role !== "timeline");
        } else {
          const allMsgs = await chatApi.getMessages(sessionId);
          sessionMessages = allMsgs.filter((m) => m.role !== "timeline");
        }
        const content = formatSessionAsMarkdown(
          session?.title ?? null,
          (session?.model ?? "")
            .replace(/^custom_[^:]+:/, "")
            .replace("__default__", "") || null,
          sessionMessages,
        );
        const filePath = await chatApi.saveSummaryTempFile(sessionId, content);

        await chatApi.generateSessionSummary(
          sessionId,
          filePath,
          selectedAgentId,
        );
        void queryClient.invalidateQueries({
          queryKey: chatKeys.sessions(selectedAgentId),
        });
        toast.success(t("sessionManager.generateSummary"));
      } catch (err) {
        toast.error(
          t("sessionManager.generateFailed", {
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      } finally {
        setGeneratingSummaryId(null);
      }
    },
    [selectedAgentId, sessions, activeSessionId, messages, queryClient, t],
  );

  const handleGenerateDailyReport = useCallback(async () => {
    if (!dailyReportDate) return;
    setDailyReportLoading(true);
    setDailyReportContent(null);
    try {
      const d = new Date(dailyReportDate + "T00:00:00");
      const startMs = d.getTime();
      const endMs = startMs + 86400000 - 1;
      const report = await chatApi.generateDailyReport(
        dailyReportDate,
        startMs,
        endMs,
        selectedAgentId,
      );
      setDailyReportContent(report);
    } catch (err) {
      toast.error(
        t("sessionManager.generateFailed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setDailyReportLoading(false);
    }
  }, [dailyReportDate, selectedAgentId, t]);

  // Close area context menu on outside click
  useEffect(() => {
    if (!areaMenu) return;
    const handle = (e: MouseEvent) => {
      if (
        areaMenuRef.current &&
        !areaMenuRef.current.contains(e.target as Node)
      ) {
        setAreaMenu(null);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [areaMenu]);

  const handleSend = useCallback(
    async (text: string, files: import("@/types").ChatFileRef[] = []) => {
      if (!activeSessionId) return;

      if (text.trim().toLowerCase() === "/clear") {
        await handleClearMessages();
        return;
      }

      if (text.trim().toLowerCase() === "/export") {
        await handleExportSession(activeSessionId);
        return;
      }

      if (text.trim().toLowerCase() === "/preview") {
        setPreviewOpen((v) => !v);
        return;
      }

      await doSendToAgent(text, files);
    },
    [activeSessionId, queryClient, t, doSendToAgent],
  );

  const handleApprove = useCallback(async () => {
    if (!pendingApproval) return;
    await chatApi.approveRun(pendingApproval.runId, true);
    if (activeSessionId)
      sessionStreams.setPendingApproval(activeSessionId, null);
  }, [pendingApproval, activeSessionId, sessionStreams]);

  const handleDeny = useCallback(async () => {
    if (!pendingApproval) return;
    await chatApi.approveRun(pendingApproval.runId, false);
    if (activeSessionId)
      sessionStreams.setPendingApproval(activeSessionId, null);
  }, [pendingApproval, activeSessionId, sessionStreams]);

  return (
    <div className="flex flex-col h-full">
      {/* Top tab bar */}
      <div className="flex items-center border-b shrink-0 h-10 bg-muted/30">
        <button
          type="button"
          onClick={() => setSidebarTab("chat")}
          className={cn(
            "flex items-center gap-1.5 px-4 h-full text-xs font-medium transition-colors",
            sidebarTab === "chat"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {t("hermes.chat.title", { defaultValue: "聊天" })}
        </button>
        <button
          type="button"
          onClick={() => {
            setSidebarTab("cron");
            void queryClient.invalidateQueries({ queryKey: cronKeys.list });
          }}
          className={cn(
            "flex items-center gap-1.5 px-4 h-full text-xs font-medium transition-colors",
            sidebarTab === "cron"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Clock className="w-3.5 h-3.5" />
          {t("cron.title", { defaultValue: "定时任务" })}
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* CronPage: always mounted to preserve state, hidden when not active */}
        <div className={sidebarTab === "cron" ? "contents" : "hidden"}>
          <CronPage />
        </div>

        {/* Chat: always mounted so in-progress runs survive tab switches */}
        <div className={cn("contents", sidebarTab !== "chat" && "hidden")}>
          <ChatSidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={setActiveSessionId}
            onNewSession={handleNewSession}
            isLocked={false}
            processingSessionIds={allProcessingSessionIds}
            onDeleteSession={handleDeleteSession}
            onRenameSession={handleRenameSession}
            onExportSession={handleExportSession}
            onGenerateSummary={
              generatingSummaryId ? undefined : handleGenerateSummary
            }
            onDailyReport={() => {
              setDailyReportDate(new Date().toISOString().slice(0, 10));
              setDailyReportContent(null);
              setDailyReportOpen(true);
            }}
          />
          <div
            className="flex-1 flex flex-col min-w-0"
            onContextMenu={(e) => {
              const bubble = (e.target as HTMLElement).closest(
                "[data-message-bubble]",
              );
              if (bubble) return;
              e.preventDefault();
              setAreaMenu({ x: e.clientX, y: e.clientY });
            }}
          >
            <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
              <div className="py-4" style={{ overflowAnchor: "auto" }}>
                {!activeSessionId ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm py-20">
                    {t("hermes.chat.noSessions")}
                  </div>
                ) : (
                  <>
                    {messages
                      .filter((m) => m.role !== "tool")
                      .filter((m, idx, arr) => {
                        // Hide the last assistant message only when streamGroups is the
                        // persisted timeline for that response AND no new request is running.
                        if (streamGroups.length === 0) return true;
                        if (isSending || isStreaming || isWaiting) return true;
                        const lastAssistantIdx = arr.reduce(
                          (acc, cur, i) => (cur.role === "assistant" ? i : acc),
                          -1,
                        );
                        return !(
                          m.role === "assistant" && idx === lastAssistantIdx
                        );
                      })
                      .map((msg) => (
                        <ChatMessageBubble
                          key={msg.id}
                          message={msg}
                          onDelete={(id) => deleteMessage.mutate(id)}
                          onResend={(content) => void doSendToAgent(content)}
                          outputFiles={artifactsMap.get(msg.id)}
                        />
                      ))}
                    {/* Pure text streaming (no tool calls) */}
                    {streamGroups.length === 0 && streamingContent && (
                      <ChatMessageBubble
                        message={{
                          id: "__streaming__",
                          sessionId: activeSessionId ?? "",
                          role: "assistant",
                          content: streamingContent,
                          toolCalls: null,
                          toolCallId: null,
                          name: null,
                          fileRefs: null,
                          createdAt: Date.now(),
                        }}
                      />
                    )}
                    {/* Interleaved tool + response groups */}
                    {streamGroups.length > 0 &&
                      (() => {
                        const fmtSecs = (s: number) => {
                          if (s >= 3600) return `${(s / 3600).toFixed(1)}h`;
                          if (s >= 60) return `${(s / 60).toFixed(1)}m`;
                          return `${s.toFixed(1)}s`;
                        };

                        // Build render items: batch consecutive no-text groups, keep text groups separate
                        type RenderItem =
                          | {
                              type: "batch";
                              groups: typeof streamGroups;
                              batchKey: number;
                            }
                          | { type: "single"; group: (typeof streamGroups)[0] };

                        const items: RenderItem[] = [];
                        let batchKey = 0;
                        for (let i = 0; i < streamGroups.length; i++) {
                          const g = streamGroups[i];
                          // Only batch consecutive completed groups with no text
                          if (!g.text && g.status !== "running") {
                            const batch = [g];
                            while (
                              i + 1 < streamGroups.length &&
                              !streamGroups[i + 1].text &&
                              streamGroups[i + 1].status !== "running"
                            ) {
                              i++;
                              batch.push(streamGroups[i]);
                            }
                            // Always batch (even single no-text tools use compact row)
                            items.push({
                              type: "batch",
                              groups: batch,
                              batchKey: batchKey++,
                            });
                          } else {
                            items.push({ type: "single", group: g });
                          }
                        }

                        // Merge adjacent batch items that have no single/text item between them
                        const merged: RenderItem[] = [];
                        for (let i = 0; i < items.length; i++) {
                          const item = items[i];
                          if (
                            item.type === "batch" &&
                            merged.length > 0 &&
                            merged[merged.length - 1].type === "batch"
                          ) {
                            const prev = merged[merged.length - 1] as {
                              type: "batch";
                              groups: typeof streamGroups;
                              batchKey: number;
                            };
                            merged[merged.length - 1] = {
                              type: "batch",
                              groups: [...prev.groups, ...item.groups],
                              batchKey: prev.batchKey,
                            };
                          } else {
                            merged.push(item);
                          }
                        }
                        const finalItems = merged;

                        const completedCount = streamGroups.filter(
                          (g) => g.status === "completed",
                        ).length;
                        const totalGroups = streamGroups.length;

                        return (
                          <div className="my-1">
                            {/* Collapse toggle header */}
                            <button
                              type="button"
                              className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground mb-0.5 ml-1"
                              onClick={() => setTimelineCollapsed((v) => !v)}
                            >
                              {timelineCollapsed ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronUp className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {timelineCollapsed
                                  ? `${completedCount}/${totalGroups} 个工具调用`
                                  : "收起"}
                              </span>
                            </button>
                            {/* Show running items always; show completed items only when not collapsed */}
                            <div className="ml-3 space-y-0">
                              {finalItems
                                .filter((item) => {
                                  if (!timelineCollapsed) return true;
                                  // When collapsed, only show running groups
                                  if (item.type === "batch")
                                    return item.groups.some(
                                      (g) => g.status === "running",
                                    );
                                  return item.group.status === "running";
                                })
                                .map((item, itemIdx, visibleItems) => {
                                  const isLastItem =
                                    itemIdx === visibleItems.length - 1;

                                  if (item.type === "batch") {
                                    // Collapsed batch row
                                    const batch = item.groups;
                                    const allDone = batch.every(
                                      (g) => g.status === "completed",
                                    );
                                    const hasRunning = batch.some(
                                      (g) => g.status === "running",
                                    );
                                    const totalDuration = batch.reduce(
                                      (s, g) =>
                                        s + (g.duration ?? g.elapsedMs / 1000),
                                      0,
                                    );
                                    return (
                                      <BatchToolRow
                                        key={`batch-${item.batchKey}`}
                                        groups={batch}
                                        allDone={allDone}
                                        hasRunning={hasRunning}
                                        totalDuration={totalDuration}
                                        fmtSecs={fmtSecs}
                                        hasLineBelow={!isLastItem}
                                      />
                                    );
                                  }

                                  const group = item.group;
                                  const elapsedDisplay =
                                    group.status === "running"
                                      ? fmtSecs(group.elapsedMs / 1000)
                                      : group.duration !== undefined
                                        ? fmtSecs(group.duration)
                                        : null;
                                  return (
                                    <div key={group.id} className="flex gap-2">
                                      <div
                                        className="flex flex-col items-center pt-1 shrink-0"
                                        style={{ width: 20 }}
                                      >
                                        <div
                                          className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border ${
                                            group.status === "running"
                                              ? "border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20"
                                              : group.status === "error"
                                                ? "border-red-400 bg-red-50 dark:bg-red-900/20"
                                                : "border-green-400 bg-green-50 dark:bg-green-900/20"
                                          }`}
                                        >
                                          {group.status === "running" ? (
                                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                                          ) : group.status === "error" ? (
                                            <span className="text-red-500 text-[8px] font-bold">
                                              ✕
                                            </span>
                                          ) : (
                                            <span className="text-green-500 text-[8px] font-bold">
                                              ✓
                                            </span>
                                          )}
                                        </div>
                                        {(!isLastItem || group.text) && (
                                          <div
                                            className="w-px flex-1 bg-border mt-0.5"
                                            style={{ minHeight: 8 }}
                                          />
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0 pb-0">
                                        <div className="flex items-center gap-0.5 text-xs py-0">
                                          <span className="font-medium text-foreground">
                                            {group.tool}
                                          </span>
                                          {elapsedDisplay && (
                                            <span className="text-muted-foreground/60 shrink-0 ml-1.5">
                                              {elapsedDisplay}
                                            </span>
                                          )}
                                          {group.preview && (
                                            <span className="text-muted-foreground/70 truncate max-w-[300px] font-mono ml-2">
                                              {group.preview}
                                            </span>
                                          )}
                                        </div>
                                        {group.text && (
                                          <div className="mt-0.5 mb-0 -ml-4">
                                            <ChatMessageBubble
                                              message={{
                                                id: `__streaming_${group.id}__`,
                                                sessionId: activeSessionId,
                                                role: "assistant",
                                                content: group.text,
                                                toolCalls: null,
                                                toolCallId: null,
                                                name: null,
                                                fileRefs: null,
                                                createdAt: Date.now(),
                                              }}
                                            />
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        );
                      })()}
                    {/* Dynamic status indicator — below timeline so it's always visible */}
                    {(isSending || isWaiting || isStreaming) && (
                      <div className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground flex-wrap">
                        <span className="flex gap-0.5">
                          <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                          <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                          <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                        </span>
                        <span
                          className={
                            currentTool
                              ? "text-yellow-600 dark:text-yellow-400"
                              : ""
                          }
                        >
                          {isSending || isWaiting
                            ? t("hermes.chat.thinking", {
                                defaultValue: "思考中",
                              })
                            : currentTool
                              ? `调用 ${currentTool}`
                              : streamingContent
                                ? "生成中"
                                : t("hermes.chat.thinking", {
                                    defaultValue: "思考中",
                                  })}
                        </span>
                        {elapsedSecs > 0 && (
                          <span className="text-muted-foreground/60">
                            {elapsedSecs}s
                          </span>
                        )}
                        {streamTokens > 0 && (
                          <span className="text-muted-foreground/60">
                            ↓{streamTokens} tokens
                          </span>
                        )}
                        {/* 工具调用中时常驻显示允许/拒绝，已永久允许的工具不再提示 */}
                        {currentTool &&
                          runIdRef.current &&
                          !alwaysAllowedTools.has(currentTool) &&
                          (() => {
                            const rid = runIdRef.current!;
                            const tool = currentTool;
                            const port = selectedAgentPort ?? null;
                            const key = selectedAgentKey ?? null;
                            return (
                              <>
                                <button
                                  className="ml-2 px-2 py-0.5 rounded bg-green-600 text-white text-xs hover:bg-green-700"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void chatApi.approveRun(
                                      rid,
                                      true,
                                      port,
                                      key,
                                    );
                                  }}
                                >
                                  允许一次
                                </button>
                                <button
                                  className="px-2 py-0.5 rounded bg-green-800 text-white text-xs hover:bg-green-900"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void chatApi.approveRunChoice(
                                      rid,
                                      "always",
                                      port,
                                      key,
                                    );
                                    setAlwaysAllowedTools(
                                      (prev) => new Set([...prev, tool]),
                                    );
                                  }}
                                >
                                  永久允许
                                </button>
                                <button
                                  className="px-2 py-0.5 rounded bg-muted border text-xs hover:bg-accent"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void chatApi.approveRun(
                                      rid,
                                      false,
                                      port,
                                      key,
                                    );
                                  }}
                                >
                                  拒绝
                                </button>
                              </>
                            );
                          })()}
                      </div>
                    )}
                    {/* Approval card — when approval.required event is received */}
                    {pendingApproval && (
                      <ApprovalCard
                        approval={pendingApproval}
                        onApprove={handleApprove}
                        onDeny={handleDeny}
                      />
                    )}
                  </>
                )}
                <div ref={scrollBottomRef} style={{ overflowAnchor: "auto" }} />
              </div>
            </ScrollArea>

            <ChatInput
              onSend={handleSend}
              onStop={handleStop}
              isStreaming={isStreaming || isWaiting || isSending}
              isStopping={isStopping}
              disabled={!isOnline || !activeSessionId}
              favoriteSkills={favoriteSkills}
              allSkills={installedSkills}
              onToggleSkillFavorite={(id, isFavorite) =>
                toggleFavoriteMutation.mutate({ id, isFavorite })
              }
              agents={agents}
              selectedAgentId={selectedAgentId}
              onSelectAgent={onSelectAgent}
              onOpenVoiceSettings={onOpenSettings}
              onHeightChange={(delta) => {
                const viewport = scrollRef.current?.querySelector(
                  "[data-radix-scroll-area-viewport]",
                ) as HTMLElement | null;
                if (!viewport) return;
                inputResizingRef.current = true;
                viewport.scrollTop += delta;
                setTimeout(() => {
                  inputResizingRef.current = false;
                }, 0);
              }}
            />
          </div>

          {/* Markdown preview panel */}
          <div
            className={cn(
              "flex flex-col border-l bg-background overflow-hidden",
              "transition-[max-width,opacity] duration-300 ease-in-out",
              previewOpen
                ? "max-w-[33vw] min-w-[320px] opacity-100"
                : "max-w-0 opacity-0 pointer-events-none",
            )}
          >
            {previewOpen && (
              <ChatMarkdownPreview
                markdownContent={previewMarkdown}
                onClose={() => setPreviewOpen(false)}
                onExport={
                  activeSessionId
                    ? () => void handleExportSession(activeSessionId)
                    : undefined
                }
              />
            )}
          </div>
        </div>
      </div>

      {/* Chat area context menu */}
      {areaMenu && (
        <div
          ref={areaMenuRef}
          className="fixed z-50 min-w-[160px] rounded-md border bg-popover shadow-md py-1 text-sm"
          style={{ left: areaMenu.x, top: areaMenu.y }}
        >
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted transition-colors text-left"
            onClick={() => {
              setPreviewOpen((v) => !v);
              setAreaMenu(null);
            }}
            disabled={!activeSessionId || messages.length === 0}
          >
            <Eye className="w-3.5 h-3.5" />
            {previewOpen ? "关闭预览" : "预览 Markdown"}
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted transition-colors text-left"
            onClick={() => {
              if (activeSessionId) void handleExportSession(activeSessionId);
              setAreaMenu(null);
            }}
            disabled={!activeSessionId || messages.length === 0}
          >
            <Download className="w-3.5 h-3.5" />
            {t("hermes.chat.exportSession", {
              defaultValue: "导出为 Markdown",
            })}
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted transition-colors text-left text-destructive"
            onClick={() => {
              void handleClearMessages();
              setAreaMenu(null);
            }}
            disabled={!activeSessionId || messages.length === 0}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t("hermes.chat.clearMessages", { defaultValue: "清除所有消息" })}
          </button>
        </div>
      )}

      {/* Daily Report Dialog */}
      {dailyReportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setDailyReportOpen(false)}
        >
          <div
            className="bg-background rounded-lg shadow-xl w-full max-w-lg mx-4 p-5 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {t("sessionManager.dailyReportTitle")}
              </h2>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setDailyReportOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dailyReportDate}
                onChange={(e) => {
                  setDailyReportDate(e.target.value);
                  setDailyReportContent(null);
                }}
                className="flex h-8 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <button
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                onClick={() => void handleGenerateDailyReport()}
                disabled={dailyReportLoading}
              >
                {dailyReportLoading
                  ? t("sessionManager.dailyReportGenerating")
                  : t("sessionManager.dailyReportGenerate")}
              </button>
            </div>
            {dailyReportContent && (
              <div className="overflow-y-auto max-h-80 text-sm whitespace-pre-wrap border rounded-md p-3 bg-muted/30">
                {dailyReportContent}
              </div>
            )}
            {!dailyReportContent && !dailyReportLoading && (
              <p className="text-xs text-muted-foreground">
                {t("sessionManager.dailyReportEmpty")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
