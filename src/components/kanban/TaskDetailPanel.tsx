import { X, Copy, Download, CheckCircle, Clock, AlertCircle, Activity, Play, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTaskConversation, useUnblockTask, useTaskEvents, useTaskRuns } from "@/hooks/useKanban";
import { cn } from "@/lib/utils";
import type { KanbanTask } from "@/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";

interface TaskDetailPanelProps {
  task: KanbanTask;
  boardSlug: string;
  onClose: () => void;
}

const STATUS_COLORS = {
  ready: "bg-blue-500",
  running: "bg-yellow-500",
  blocked: "bg-gray-400",
  done: "bg-green-500",
  failed: "bg-red-500",
};

const STATUS_LABELS = {
  ready: "准备就绪",
  running: "执行中",
  blocked: "等待中",
  done: "已完成",
  failed: "失败",
};

interface Message {
  role: "user" | "assistant";
  content: string;
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function formatTime(ts: number | string | null) {
  if (!ts) return "—";
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function TaskDetailPanel({ task, boardSlug, onClose }: TaskDetailPanelProps) {
  const taskId = task.id || task.task_id || "";
  const isActive = task.status === "running" || task.status === "blocked";
  const [activeTab, setActiveTab] = useState<"runs" | "events" | "conversation">(
    isActive ? "runs" : "conversation"
  );

  const { data: conversation, isLoading: conversationLoading } = useTaskConversation(boardSlug, taskId);
  const { data: runsData, isLoading: runsLoading } = useTaskRuns(
    isActive ? boardSlug : null,
    isActive ? taskId : null,
  );
  const { data: eventsData, isLoading: eventsLoading } = useTaskEvents(boardSlug, taskId);
  const unblockTask = useUnblockTask(boardSlug);

  // 从 events 里取最近一条 blocked 事件的 reason
  const blockReason = (() => {
    if (!eventsData || typeof eventsData !== "object") return null;
    const events = (eventsData as any).events as any[] | undefined;
    if (!events) return null;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].kind === "blocked" && events[i].payload?.reason) {
        return events[i].payload.reason as string;
      }
    }
    return null;
  })();

  const runs: any[] = (() => {
    if (!runsData) return [];
    if (Array.isArray(runsData)) return runsData;
    return (runsData as any).runs ?? [];
  })();

  const events: any[] = (() => {
    if (!eventsData) return [];
    if (Array.isArray(eventsData)) return eventsData;
    return (eventsData as any).events ?? [];
  })();

  const messages: Message[] = [];
  if (conversation && typeof conversation === "object") {
    if (Array.isArray(conversation)) {
      messages.push(...(conversation as Message[]));
    } else if ("messages" in conversation) {
      const msgs = (conversation as any).messages;
      if (Array.isArray(msgs)) messages.push(...msgs);
    }
  }

  const handleCopyAll = async () => {
    if (messages.length === 0) { toast.error("暂无会话内容可复制"); return; }
    try {
      const text = messages.map((m) => `${m.role === "user" ? "用户" : "AI"}:\n${m.content}`).join("\n---\n\n");
      await navigator.clipboard.writeText(text);
      toast.success("已复制到剪贴板");
    } catch { toast.error("复制失败"); }
  };

  const handleExportAll = async () => {
    if (messages.length === 0) { toast.error("暂无会话内容可导出"); return; }
    try {
      const content = [`# ${task.title}`, "", `**任务 ID**: ${taskId}`, "", "---", "",
        ...messages.map((m) => `## ${m.role === "user" ? "👤 用户" : "🤖 AI"}\n\n${m.content}\n`)
      ].join("\n");
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
      const defaultFilename = `${task.title}_${ts}.md`;
      const filePath = await save({ defaultPath: defaultFilename, filters: [{ name: "Markdown", extensions: ["md"] }] });
      if (!filePath) return;
      const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filePath.split("/").pop() || defaultFilename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("会话已导出");
    } catch { toast.error("导出失败"); }
  };

  const EVENT_ICONS: Record<string, React.ReactNode> = {
    claimed: <Play className="w-3 h-3 text-blue-500" />,
    spawned: <Activity className="w-3 h-3 text-purple-500" />,
    completed: <CheckCircle className="w-3 h-3 text-green-500" />,
    failed: <AlertCircle className="w-3 h-3 text-red-500" />,
    blocked: <StopCircle className="w-3 h-3 text-amber-500" />,
    heartbeat: <Activity className="w-3 h-3 text-gray-400" />,
  };

  return (
    <div className="w-[480px] border-l bg-background flex flex-col">
      {/* Header */}
      <div className="h-14 px-4 border-b flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
          <div className={cn("w-2 h-2 rounded-full shrink-0", STATUS_COLORS[task.status as keyof typeof STATUS_COLORS])} />
          <span className="text-xs font-medium text-muted-foreground shrink-0">
            {STATUS_LABELS[task.status as keyof typeof STATUS_LABELS]}
          </span>
          <h2 className="text-sm font-semibold truncate">{task.title}</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Block Reason Banner */}
      {task.status === "blocked" && blockReason && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-0.5">等待人工审核</p>
          <p className="text-xs text-amber-700 dark:text-amber-400">{blockReason}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b shrink-0">
        {isActive && (
          <>
            <button
              onClick={() => setActiveTab("runs")}
              className={cn("flex-1 py-2 text-xs font-medium transition-colors", activeTab === "runs" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground")}
            >
              运行记录
            </button>
            <button
              onClick={() => setActiveTab("events")}
              className={cn("flex-1 py-2 text-xs font-medium transition-colors", activeTab === "events" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground")}
            >
              事件流水
            </button>
          </>
        )}
        <button
          onClick={() => setActiveTab("conversation")}
          className={cn("flex-1 py-2 text-xs font-medium transition-colors", activeTab === "conversation" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground")}
        >
          对话记录
        </button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-4">

        {/* Runs Tab */}
        {activeTab === "runs" && (
          runsLoading ? (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">加载中...</div>
          ) : runs.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">暂无运行记录</div>
          ) : (
            <div className="space-y-3">
              {runs.map((run: any, i: number) => {
                const started = run.started_at ?? run.start_time ?? null;
                const ended = run.ended_at ?? run.end_time ?? null;
                const duration = run.duration_ms ?? (started && ended ? (new Date(ended).getTime() - new Date(started).getTime()) : null);
                const status = run.status ?? (run.error ? "failed" : "completed");
                return (
                  <div key={i} className="rounded-lg border bg-card p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className={cn("px-2 py-0.5 rounded-full font-medium",
                        status === "completed" ? "bg-green-100 text-green-700" :
                        status === "failed" ? "bg-red-100 text-red-700" :
                        "bg-yellow-100 text-yellow-700"
                      )}>
                        {status === "completed" ? "已完成" : status === "failed" ? "失败" : "执行中"}
                      </span>
                      {duration != null && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {formatDuration(duration)}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                      <span>开始：{formatTime(started)}</span>
                      <span>结束：{formatTime(ended)}</span>
                    </div>
                    {run.summary && (
                      <p className="text-foreground leading-relaxed">{run.summary}</p>
                    )}
                    {run.error && (
                      <p className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded p-2">{run.error}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* Events Tab */}
        {activeTab === "events" && (
          eventsLoading ? (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">加载中...</div>
          ) : events.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">暂无事件记录</div>
          ) : (
            <div className="space-y-1">
              {[...events].reverse().map((ev: any, i: number) => (
                <div key={i} className="flex items-start gap-2 py-1.5 text-xs border-b last:border-0">
                  <span className="mt-0.5 shrink-0">{EVENT_ICONS[ev.kind] ?? <Activity className="w-3 h-3 text-gray-400" />}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize">{ev.kind}</span>
                      <span className="text-muted-foreground">{formatTime(ev.timestamp ?? ev.ts ?? null)}</span>
                    </div>
                    {ev.payload?.reason && <p className="text-muted-foreground mt-0.5 break-words">{ev.payload.reason}</p>}
                    {ev.payload?.summary && <p className="text-muted-foreground mt-0.5 break-words">{ev.payload.summary}</p>}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Conversation Tab */}
        {activeTab === "conversation" && (
          conversationLoading ? (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">加载对话记录中...</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              <p>暂无对话记录</p>
              <p className="text-xs mt-1">任务执行后将显示对话内容</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div key={index} className={cn("flex gap-3", message.role === "assistant" ? "flex-row" : "flex-row-reverse")}>
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                    message.role === "assistant" ? "bg-blue-500 text-white" : "bg-green-500 text-white"
                  )}>
                    {message.role === "assistant" ? "AI" : "U"}
                  </div>
                  <div className={cn("flex-1 rounded-lg px-4 py-3 text-sm break-words overflow-hidden",
                    message.role === "assistant" ? "bg-muted" : "bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100"
                  )}>
                    <div className="prose prose-sm max-w-none break-words [&_*]:text-inherit">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </ScrollArea>

      {/* Footer Actions */}
      <div className="p-3 border-t flex flex-col gap-2 shrink-0">
        {task.status === "blocked" && (
          <Button size="sm" onClick={() => unblockTask.mutate(taskId)} disabled={unblockTask.isPending} className="w-full bg-green-600 hover:bg-green-700 text-white">
            <CheckCircle className="h-4 w-4 mr-1" />
            {unblockTask.isPending ? "处理中..." : "通过审核"}
          </Button>
        )}
        {activeTab === "conversation" && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyAll} disabled={conversationLoading || messages.length === 0} className="flex-1">
              <Copy className="h-4 w-4 mr-1" />复制会话
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportAll} disabled={conversationLoading || messages.length === 0} className="flex-1">
              <Download className="h-4 w-4 mr-1" />导出会话
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
