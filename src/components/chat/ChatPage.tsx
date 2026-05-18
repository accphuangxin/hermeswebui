import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
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
} from "@/hooks/useHermesChat";
import { useChatStream, type ToolActivity, type ApprovalRequest } from "@/hooks/useChatStream";
import { chatApi } from "@/lib/api/chat";
import { compressContext } from "@/lib/contextCompression";
import { ChatSidebar, type SidebarTab } from "./ChatSidebar";
import { ChatHeader } from "./ChatHeader";
import { CronPage } from "@/components/cron/CronPage";
import { ChatMessageBubble } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ToolActivityBlock } from "./ToolActivityBlock";
import { ApprovalCard } from "./ApprovalCard";
import { ApiServerKeyDialog } from "./ApiServerKeyDialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ChatPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const [hermesSessionId, setHermesSessionId] = useState<string | null>(null);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("chat");
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollBottomRef = useRef<HTMLDivElement>(null);

  const { data: status } = useChatStatus(true);
  const { data: models = [] } = useChatModels();
  const { data: sessions = [] } = useChatSessions();
  const { data: messages = [] } = useChatMessages(activeSessionId);
  const createSession = useCreateChatSession();
  const deleteSession = useDeleteChatSession();
  const updateSession = useUpdateChatSession();
  const saveMessage = useSaveChatMessage();
  const userCancelledRef = useRef(false);
  const { sendRun, isStreaming, stop } = useChatStream();
  const handleStop = useCallback(() => {
    userCancelledRef.current = true;
    void stop();
  }, [stop]);

  const isOnline = status?.online ?? false;

  // On mount: check if API_SERVER_KEY is configured; prompt if not found anywhere
  useEffect(() => {
    void invoke<string>("getHermesApiServerKey").then((key) => {
      if (!key) setShowApiKeyDialog(true);
    });
  }, []);

  // Auto-select default model
  useEffect(() => {
    if (!selectedModel && status?.defaultModel) {
      const provider = status.provider?.replace("custom:", "") ?? "";
      const modelValue = provider
        ? `custom_${provider}:${status.defaultModel}`
        : status.defaultModel;
      setSelectedModel(modelValue);
    }
  }, [status?.defaultModel, status?.provider, selectedModel]);

  // Auto-select first session
  useEffect(() => {
    if (!activeSessionId && sessions.length > 0) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  // Reset Hermes session when switching chat sessions
  useEffect(() => {
    setHermesSessionId(null);
  }, [activeSessionId]);

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
    async (text: string) => {
      if (!isOnline || !activeSessionId) return;

      const userMsgId = crypto.randomUUID();
      await saveMessage.mutateAsync({
        sessionId: activeSessionId,
        message: { id: userMsgId, role: "user", content: text },
      });

      setStreamingContent("");
      setToolActivities([]);
      setPendingApproval(null);

      const hermesModel = selectedModel
        ? selectedModel.replace(/^custom_[^:]+:/, "")
        : undefined;

      const { compressedInput, wasCompressed, droppedCount } = compressContext(messages, text);
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
              const title = text.slice(0, 50) + (text.length > 50 ? "..." : "");
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
    async (text: string) => {
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

      await doSendToAgent(text);
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
    <div className="flex h-full">
      <ApiServerKeyDialog
        open={showApiKeyDialog}
        onSaved={() => setShowApiKeyDialog(false)}
      />
      <ChatSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        activeTab={sidebarTab}
        onTabChange={setSidebarTab}
      />
      <div className="flex-1 flex flex-col min-w-0">
        {sidebarTab === "cron" && <CronPage />}
        {sidebarTab === "chat" && <>
        <ChatHeader
          online={isOnline}
          defaultModel={status?.defaultModel ?? null}
          provider={status?.provider ?? null}
          models={models}
          selectedModel={selectedModel}
          onModelChange={async (m) => {
            setSelectedModel(m);
            setHermesSessionId(null);
            // m format: "custom_{provider}:{modelId}"
            const match = m.match(/^custom_([^:]+):(.+)$/);
            if (match) {
              const [, providerId, modelId] = match;
              try {
                await invoke("switchHermesModel", { modelId, providerId });
                toast.success(t("hermes.chat.modelSwitched", {
                  model: modelId,
                  provider: providerId,
                  defaultValue: `已切换到 ${modelId} (${providerId})`,
                }));
              } catch (e) {
                toast.error(t("hermes.chat.modelSwitchFailed", {
                  defaultValue: "模型切换失败",
                }), { description: String(e) });
              }
            }
          }}
        />
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
                    <ChatMessageBubble key={msg.id} message={msg} />
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
        </>}
      </div>
    </div>
  );
}
