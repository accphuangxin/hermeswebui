import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Send, Square, Bot, User, FileText,
  Wrench, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useChatStream, type ApprovalRequest } from "@/hooks/useChatStream";
import { knowledgeApi } from "@/lib/api/knowledge";
import { chatApi } from "@/lib/api/chat";
import { useQuery } from "@tanstack/react-query";

interface ToolActivity {
  id: number;
  tool: string;
  preview: string;
  status: "running" | "completed" | "error";
  duration?: number;
  result?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: ToolActivity[]; // 本轮工具调用历史（附在 assistant 消息上）
}

function friendlyError(err: string): string {
  const s = err.toLowerCase();
  if (s.includes("free_quota_exhausted") || s.includes("quota_exhausted"))
    return "Token 配额已耗尽，请在 Provider 页面切换或充值 API Key";
  if (s.includes("402") || s.includes("payment_required") || s.includes("insufficient_quota"))
    return "账户余额不足，请检查 API Key 配额";
  if (s.includes("401") || s.includes("invalid_api_key") || s.includes("authentication"))
    return "认证失败，请检查 API Key 是否有效";
  if (s.includes("429") || s.includes("rate_limit") || s.includes("too_many_requests"))
    return "请求频率超限，请稍后重试";
  if (s.includes("503") || s.includes("service_unavailable") || s.includes("overloaded"))
    return "上游服务暂时不可用，请稍后重试";
  if (s.includes("timeout") || s.includes("timed out"))
    return "请求超时，请检查网络或稍后重试";
  return err;
}

interface KnowledgeChatProps {
  filePath: string | null;
  onFileChanged?: () => void;
}

// 单个工具活动行
function ToolActivityRow({ activity }: { activity: ToolActivity }) {
  const [expanded, setExpanded] = useState(false);
  const hasResult = !!activity.result;

  return (
    <div className="text-xs rounded border border-border/50 overflow-hidden">
      <button
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1 text-left",
          activity.status === "running" && "bg-blue-50 dark:bg-blue-950/30",
          activity.status === "completed" && "bg-muted/60",
          activity.status === "error" && "bg-red-50 dark:bg-red-950/30",
          hasResult && "cursor-pointer hover:bg-muted/80",
        )}
        onClick={() => hasResult && setExpanded((v) => !v)}
        disabled={!hasResult}
      >
        {activity.status === "running" && (
          <Loader2 className="w-3 h-3 shrink-0 text-blue-500 animate-spin" />
        )}
        {activity.status === "completed" && (
          <CheckCircle2 className="w-3 h-3 shrink-0 text-green-500" />
        )}
        {activity.status === "error" && (
          <XCircle className="w-3 h-3 shrink-0 text-red-500" />
        )}
        <Wrench className="w-3 h-3 shrink-0 text-muted-foreground" />
        <span className="font-medium text-foreground/80 shrink-0">{activity.tool}</span>
        {activity.preview && (
          <span className="truncate text-muted-foreground flex-1">{activity.preview}</span>
        )}
        {activity.duration !== undefined && (
          <span className="shrink-0 text-muted-foreground ml-1">
            {activity.duration < 1000
              ? `${activity.duration}ms`
              : `${(activity.duration / 1000).toFixed(1)}s`}
          </span>
        )}
        {hasResult && (
          expanded
            ? <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
            : <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />
        )}
      </button>
      {expanded && hasResult && (
        <div className="px-2 py-1 border-t border-border/50 bg-muted/30 text-muted-foreground whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
          {activity.result}
        </div>
      )}
    </div>
  );
}

export function KnowledgeChat({ filePath, onFileChanged }: KnowledgeChatProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [liveTools, setLiveTools] = useState<ToolActivity[]>([]);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const toolIdRef = useRef(0);
  const scrollBottomRef = useRef<HTMLDivElement>(null);

  const { sendRun, isStreaming, isWaiting, stop } = useChatStream();

  const { data: basePath } = useQuery({
    queryKey: ["knowledge", "basePath"],
    queryFn: () => knowledgeApi.getBasePath(),
    staleTime: Infinity,
  });

  const absFilePath = basePath && filePath ? `${basePath}/${filePath}` : null;

  useEffect(() => {
    scrollBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, liveTools]);

  useEffect(() => {
    setMessages([]);
    setStreamingText("");
    setLiveTools([]);
  }, [filePath]);

  // AI 处理期间每 1.5s 轮询一次文件内容，有变化立即通知编辑器刷新
  const lastPolledContentRef = useRef<string | null>(null);
  const isActive = isStreaming || isWaiting;
  useEffect(() => {
    if (!isActive || !absFilePath || !filePath) {
      lastPolledContentRef.current = null;
      return;
    }
    const poll = async () => {
      try {
        const content = await knowledgeApi.readFile(filePath);
        if (lastPolledContentRef.current !== null && content !== lastPolledContentRef.current) {
          onFileChanged?.();
        }
        lastPolledContentRef.current = content;
      } catch {
        // 文件可能尚未写入，忽略
      }
    };
    void poll(); // 立即执行一次作为基准
    const timer = setInterval(() => { void poll(); }, 1500);
    return () => clearInterval(timer);
  }, [isActive, absFilePath, filePath, onFileChanged]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming || isWaiting) return;

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: text },
    ]);
    setInput("");
    setStreamingText("");
    setLiveTools([]);

    let fullContent = "";
    // 记录本轮工具调用快照（completed 后附到消息）
    const roundTools: ToolActivity[] = [];

    // 把目标文件绝对路径注入到 input 开头，确保 Hermes 写入正确位置
    const effectiveInput = absFilePath
      ? `请将修改结果写入此文件：${absFilePath}\n\n${text}`
      : text;

    await sendRun({
      input: effectiveInput,
      attachments: absFilePath ? [absFilePath] : [],

      onDelta: (delta) => {
        fullContent += delta;
        setStreamingText(fullContent);
      },

      onToolStarted: (tool, preview) => {
        const id = ++toolIdRef.current;
        const activity: ToolActivity = { id, tool, preview, status: "running" };
        roundTools.push(activity);
        setLiveTools((prev) => [...prev, activity]);
      },

      onToolCompleted: (tool, duration, error, result) => {
        setLiveTools((prev) =>
          prev.map((a) =>
            a.tool === tool && a.status === "running"
              ? { ...a, status: error ? "error" : "completed", duration, result }
              : a,
          ),
        );
        let idx = -1;
        for (let i = roundTools.length - 1; i >= 0; i--) {
          if (roundTools[i].tool === tool && roundTools[i].status === "running") {
            idx = i;
            break;
          }
        }
        if (idx !== -1) {
          roundTools[idx] = {
            ...roundTools[idx],
            status: error ? "error" : "completed",
            duration,
            result,
          };
        }
        if (!error) onFileChanged?.();
      },

      onApprovalRequired: (approval) => {
        setPendingApproval(approval);
      },

      onCompleted: (output) => {
        const content = output || fullContent;
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content,
            tools: roundTools.length > 0 ? [...roundTools] : undefined,
          },
        ]);
        setStreamingText("");
        setLiveTools([]);
        setPendingApproval(null);
        onFileChanged?.();
      },

      onError: (err) => {
        // 把所有仍在运行的工具标为 error，再附到 assistant 消息上
        const finalTools = roundTools.map((a) =>
          a.status === "running" ? { ...a, status: "error" as const } : a,
        );
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `❌ ${friendlyError(err)}`,
            tools: finalTools.length > 0 ? finalTools : undefined,
          },
        ]);
        setStreamingText("");
        setLiveTools([]);
        setPendingApproval(null);
      },
    });
  }, [input, isStreaming, isWaiting, absFilePath, sendRun, onFileChanged]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const isEmpty = messages.length === 0 && !streamingText && liveTools.length === 0;

  return (
    <div className="flex flex-col h-full border-l overflow-hidden">
      {/* 头部 */}
      <div className="h-10 border-b flex items-center gap-2 px-3 shrink-0 bg-background">
        <Bot className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium flex-1 truncate">
          {t("knowledge.chat.title", { defaultValue: "AI 助手" })}
        </span>
        {filePath && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground truncate max-w-[120px]">
            <FileText className="w-3 h-3 shrink-0" />
            <span className="truncate">{filePath.split("/").pop()}</span>
          </span>
        )}
      </div>

      {/* 消息列表 */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-3">
          {isEmpty && (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-2 text-muted-foreground">
              <Bot className="w-8 h-8 opacity-20" />
              <p className="text-xs">
                {filePath
                  ? t("knowledge.chat.hint", { defaultValue: "描述你想对这个文件做什么" })
                  : t("knowledge.chat.noFile", { defaultValue: "请先选择一个文件" })}
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className="space-y-1.5">
              <div
                className={cn(
                  "flex gap-2",
                  msg.role === "user" ? "flex-row-reverse" : "flex-row",
                )}
              >
                <div className="shrink-0 mt-0.5">
                  {msg.role === "assistant"
                    ? <Bot className="w-4 h-4 text-muted-foreground" />
                    : <User className="w-4 h-4 text-muted-foreground" />}
                </div>
                <div
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap break-words",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted",
                  )}
                >
                  {msg.content}
                </div>
              </div>
              {/* 历史工具调用（折叠在 assistant 消息下方） */}
              {msg.tools && msg.tools.length > 0 && (
                <div className="ml-6 space-y-1">
                  {msg.tools.map((a) => (
                    <ToolActivityRow key={a.id} activity={a} />
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* 实时工具活动 + 流式文字 */}
          {(isWaiting || isStreaming || liveTools.length > 0 || streamingText) && (
            <div className="space-y-1.5">
              {/* 实时工具进度 */}
              {liveTools.length > 0 && (
                <div className="ml-6 space-y-1">
                  {liveTools.map((a) => (
                    <ToolActivityRow key={a.id} activity={a} />
                  ))}
                </div>
              )}

              {/* 工具授权请求 */}
              {pendingApproval && (
                <div className="border border-amber-500/50 rounded-lg bg-amber-500/5 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-amber-600 dark:text-amber-400 mb-2">
                    <ShieldAlert className="w-4 h-4" />
                    需要授权：<span className="font-mono">{pendingApproval.tool}</span>
                  </div>
                  {pendingApproval.args && pendingApproval.args !== '""' && (() => {
                    let formatted = pendingApproval.args;
                    try { formatted = JSON.stringify(JSON.parse(pendingApproval.args), null, 2); } catch {}
                    return (
                      <pre className="text-[11px] bg-muted/50 rounded p-2 mb-3 overflow-x-auto whitespace-pre-wrap max-h-[100px]">
                        {formatted}
                      </pre>
                    );
                  })()}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={async () => {
                        await chatApi.approveRun(pendingApproval.runId, true);
                        setPendingApproval(null);
                      }}
                    >
                      允许
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={async () => {
                        await chatApi.approveRun(pendingApproval.runId, false);
                        setPendingApproval(null);
                      }}
                    >
                      拒绝
                    </Button>
                  </div>
                </div>
              )}

              {/* 流式回复 / 等待动画 */}
              {(isWaiting || streamingText) && (
                <div className="flex gap-2">
                  <Bot className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="rounded-lg px-3 py-2 text-sm bg-muted max-w-[85%] whitespace-pre-wrap break-words">
                    {isWaiting && !streamingText ? (
                      <span className="flex gap-1 items-center text-muted-foreground">
                        <span className="animate-bounce [animation-delay:0ms]">·</span>
                        <span className="animate-bounce [animation-delay:150ms]">·</span>
                        <span className="animate-bounce [animation-delay:300ms]">·</span>
                      </span>
                    ) : (
                      streamingText
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div ref={scrollBottomRef} />
        </div>
      </ScrollArea>

      {/* 输入区 */}
      <div className="border-t p-2 shrink-0 flex gap-2 items-end">
        <Textarea
          className="flex-1 min-h-[60px] max-h-[120px] resize-none text-sm"
          placeholder={
            filePath
              ? t("knowledge.chat.placeholder", { defaultValue: "描述修改需求… (Enter 发送)" })
              : t("knowledge.chat.noFile", { defaultValue: "请先选择一个文件" })
          }
          disabled={!filePath || isStreaming || isWaiting}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {isStreaming || isWaiting ? (
          <Button
            size="icon"
            variant="destructive"
            className="h-8 w-8 shrink-0"
            onClick={() => void stop()}
          >
            <Square className="w-3.5 h-3.5" />
          </Button>
        ) : (
          <Button
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={!filePath || !input.trim()}
            onClick={() => void handleSend()}
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
