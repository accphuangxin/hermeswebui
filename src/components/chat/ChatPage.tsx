import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MessageSquare, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import {
  chatKeys,
  useChatStatus,
  useChatSessions,
  useChatMessages,
  useCreateChatSession,
  useDeleteChatSession,
  useUpdateChatSession,
  useSaveChatMessage,
  useDeleteChatMessage,
} from "@/hooks/useHermesChat";
import { useChatStream, type ToolActivity, type ApprovalRequest } from "@/hooks/useChatStream";
import { chatApi } from "@/lib/api/chat";
import { compressContext } from "@/lib/contextCompression";
import { ChatSidebar } from "./ChatSidebar";
import type { SidebarTab } from "./ChatSidebar";
import { CronPage } from "@/components/cron/CronPage";
import { ChatMessageBubble } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ToolActivityBlock } from "./ToolActivityBlock";
import { ApprovalCard } from "./ApprovalCard";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatPageProps {
  selectedModel: string;
}

export function ChatPage({ selectedModel }: ChatPageProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const [hermesSessionId, setHermesSessionId] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("chat");
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollBottomRef = useRef<HTMLDivElement>(null);

  const { data: status } = useChatStatus(true);
  const { data: sessions = [] } = useChatSessions();
  const { data: messages = [] } = useChatMessages(activeSessionId);
  const createSession = useCreateChatSession();
  const deleteSession = useDeleteChatSession();
  const updateSession = useUpdateChatSession();
  const saveMessage = useSaveChatMessage();
  const deleteMessage = useDeleteChatMessage(activeSessionId);
  const userCancelledRef = useRef(false);
  const { sendRun, isStreaming, stop } = useChatStream();
  const handleStop = useCallback(() => {
    userCancelledRef.current = true;
    void stop();
  }, [stop]);

  const isOnline = status?.online ?? false;


  // Auto-select first session
  useEffect(() => {
    if (!activeSessionId && sessions.length > 0) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  // Reset Hermes session when switching chat sessions or model
  useEffect(() => {
    setHermesSessionId(null);
  }, [activeSessionId]);

  useEffect(() => {
    setHermesSessionId(null);
  }, [selectedModel]);

  // Auto-scroll to bottom when messages load or stream
  useEffect(() => {
    scrollBottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [activeSessionId, messages]);

  useEffect(() => {
    scrollBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamingContent, toolActivities]);

  const handleNewSession = useCallback(async () => {
    const id = crypto.randomUUID();
    await createSession.mutateAsync({ id });
    setActiveSessionId(id);
  }, [createSession]);

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

      const fileBlocks = files.length > 0
        ? files.map((f) => `<file name="${f.filename}">\n${f.content}\n</file>`).join("\n\n")
        : "";
      const fullText = fileBlocks && text ? `${fileBlocks}\n\n${text}` : fileBlocks || text;

      const fileRefsForDb = files.length > 0
        ? JSON.stringify(files.map(({ filename, mimeType, sizeBytes }) => ({ filename, mimeType, sizeBytes })))
        : null;

      const userMsgId = crypto.randomUUID();
      await saveMessage.mutateAsync({
        sessionId: activeSessionId,
        message: { id: userMsgId, role: "user", content: text, fileRefs: fileRefsForDb },
      });

      setStreamingContent("");
      setToolActivities([]);
      setPendingApproval(null);

      const hermesModel = selectedModel
        ? selectedModel.replace(/^custom_[^:]+:/, "")
        : undefined;

      const { compressedInput, wasCompressed, droppedCount } = compressContext(messages, fullText);
      if (wasCompressed) {
        toast.info(t("hermes.chat.contextCompressed", { count: droppedCount, defaultValue: `上下文过长，已省略最旧的 ${droppedCount} 条消息` }));
      }

      userCancelledRef.current = false;
      const MAX_RETRIES = 3;
      let attempt = 0;
      let lastError = "";

      while (attempt < MAX_RETRIES) {
        if (userCancelledRef.current) break;
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 1500 * attempt));
          toast.info(t("hermes.chat.retrying", { attempt, max: MAX_RETRIES, defaultValue: `请求失败，正在重试 (${attempt}/${MAX_RETRIES})...` }));
          setStreamingContent("");
          setToolActivities([]);
        }

        let fullContent = "";
        let succeeded = false;

        await sendRun({
          input: compressedInput,
          model: hermesModel,
          sessionId: wasCompressed ? undefined : (hermesSessionId ?? undefined),
          onDelta: (delta) => {
            fullContent += delta;
            setStreamingContent(fullContent);
          },
          onToolStarted: (tool, preview) => {
            setToolActivities((prev) => [...prev, { tool, preview, status: "running" }]);
          },
          onToolCompleted: (tool, duration, error) => {
            setToolActivities((prev) =>
              prev.map((a) =>
                a.tool === tool && a.status === "running"
                  ? { ...a, status: error ? "error" : "completed", duration }
                  : a,
              ),
            );
          },
          onApprovalRequired: (approval) => {
            setPendingApproval(approval);
          },
          onCompleted: async (output, runSessionId) => {
            const content = fullContent || output;
            // No content means the server responded but produced nothing — treat as failure
            if (!content) {
              lastError = t("hermes.chat.emptyResponse", { defaultValue: "服务器无返回内容" });
              return;
            }

            succeeded = true;
            setStreamingContent("");
            setToolActivities([]);

            if (runSessionId) {
              setHermesSessionId(runSessionId);
            }

            const assistantMsgId = crypto.randomUUID();
            await saveMessage.mutateAsync({
              sessionId: activeSessionId,
              message: { id: assistantMsgId, role: "assistant", content },
            });

            if (messages.length === 0) {
              const titleBase = text || files.map((f) => f.filename).join(", ");
              const title = titleBase.slice(0, 50) + (titleBase.length > 50 ? "..." : "");
              await chatApi.updateSession(activeSessionId, title);
            }
          },
          onError: (err) => {
            lastError = err;
          },
        });

        if (succeeded) return;
        attempt++;
      }

      setStreamingContent("");
      setToolActivities([]);
      if (!userCancelledRef.current && lastError) {
        toast.error("Chat error", { description: lastError });
      }
    },
    [isOnline, activeSessionId, messages, selectedModel, hermesSessionId, sendRun, saveMessage, t],
  );

  const handleSend = useCallback(
    async (text: string, files: import("@/types").ChatFileRef[] = []) => {
      if (!activeSessionId) return;

      if (text.trim().toLowerCase() === "/clear") {
        setHermesSessionId(null);
        await chatApi.clearMessages(activeSessionId);
        void queryClient.invalidateQueries({
          queryKey: chatKeys.messages(activeSessionId),
        });
        toast.success(t("hermes.chat.newSession"));
        return;
      }

      await doSendToAgent(text, files);
    },
    [activeSessionId, queryClient, t, doSendToAgent],
  );

  const handleApprove = useCallback(async () => {
    if (!pendingApproval) return;
    await chatApi.approveRun(pendingApproval.runId, true);
    setPendingApproval(null);
  }, [pendingApproval]);

  const handleDeny = useCallback(async () => {
    if (!pendingApproval) return;
    await chatApi.approveRun(pendingApproval.runId, false);
    setPendingApproval(null);
  }, [pendingApproval]);

  return (
    <div className="flex flex-col h-full">
      {/* Top tab bar */}
      <div className="flex border-b shrink-0 h-10 bg-muted/30">
        <button
          type="button"
          onClick={() => setSidebarTab("chat")}
          className={cn(
            "flex items-center gap-1.5 px-4 text-xs font-medium transition-colors",
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
          onClick={() => setSidebarTab("cron")}
          className={cn(
            "flex items-center gap-1.5 px-4 text-xs font-medium transition-colors",
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
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="py-4">
            {!activeSessionId ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm py-20">
                {t("hermes.chat.noSessions")}
              </div>
            ) : (
              <>
                {messages
                  .filter((m) => m.role !== "tool")
                  .map((msg) => (
                    <ChatMessageBubble key={msg.id} message={msg} onDelete={(id) => deleteMessage.mutate(id)} />
                  ))}
                {/* Tool activities during streaming */}
                {toolActivities.length > 0 && (
                  <div className="border-l-2 border-muted ml-5 my-2">
                    {toolActivities.map((activity, i) => (
                      <ToolActivityBlock key={`${activity.tool}-${i}`} activity={activity} />
                    ))}
                  </div>
                )}
                {/* Streaming assistant response */}
                {isStreaming && streamingContent && (
                  <ChatMessageBubble
                    message={{
                      id: "__streaming__",
                      sessionId: activeSessionId,
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
                {/* Thinking indicator */}
                {isStreaming && !streamingContent && toolActivities.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground animate-pulse">
                    {t("hermes.chat.thinking")}
                  </div>
                )}
                {/* Approval card */}
                {pendingApproval && (
                  <ApprovalCard
                    approval={pendingApproval}
                    onApprove={handleApprove}
                    onDeny={handleDeny}
                  />
                )}
              </>
            )}
              <div ref={scrollBottomRef} />
            </div>
          </ScrollArea>
          <ChatInput
            onSend={handleSend}
            onStop={handleStop}
            isStreaming={isStreaming}
            disabled={!isOnline || !activeSessionId}
          />
        </div>
        </div>
      </div>
    </div>
  );
}

