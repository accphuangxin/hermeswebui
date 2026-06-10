import { X, Clock, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTaskThreadMessages } from "@/hooks/useKanban";
import { cn } from "@/lib/utils";
import type { KanbanTask } from "@/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";

// 匹配消息中的绝对文件路径（Unix/macOS）
const FILE_PATH_RE = /(\/[^\s，。、；：！？一-鿿]+\.\w+)/g;

function openFilePath(path: string) {
  invoke("open_file_path", { path }).catch((e) => {
    toast.error(`无法打开文件: ${e}`);
  });
}

function renderContentWithPaths(content: string) {
  const parts = content.split(FILE_PATH_RE);
  if (parts.length === 1) return null; // 无路径，走普通 markdown

  return (
    <span>
      {parts.map((part, i) =>
        FILE_PATH_RE.test(part) ? (
          <button
            key={i}
            onClick={() => openFilePath(part)}
            className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-800 cursor-pointer break-all"
            title={`打开文件: ${part}`}
          >
            <FileText className="w-3 h-3 shrink-0" />
            {part}
          </button>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

interface TaskThreadPanelProps {
  task: KanbanTask;
  boardSlug: string;
  onClose: () => void;
}

export function TaskThreadPanel({
  task,
  boardSlug,
  onClose,
}: TaskThreadPanelProps) {
  const taskId = task.id || task.task_id || "";
  const { data, isLoading } = useTaskThreadMessages(boardSlug, taskId, "all");

  const messages = data?.messages ?? [];

  const handleExport = () => {
    if (messages.length === 0) {
      toast.error("暂无消息可导出");
      return;
    }

    const lines: string[] = [
      `# ${task.title}`,
      "",
      `> 任务数：${data?.task_count ?? 0}  消息数：${data?.message_count ?? 0}`,
      "",
      "---",
      "",
    ];

    for (const msg of messages) {
      const role = msg.role === "user" ? "👤 用户" : "🤖 AI";
      const time = new Date(msg.timestamp * 1000).toLocaleString("zh-CN");
      lines.push(`## ${role} · ${msg.task_title} · ${time}`, "", msg.content, "", "---", "");
    }

    const filename = `${task.title}.md`;
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`已导出：${filename}，保存至下载目录`);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="h-14 px-6 border-b flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-base font-semibold truncate">{task.title}</h2>
          {data && (
            <span className="text-xs text-muted-foreground shrink-0">
              {data.task_count} 个任务 · {data.message_count} 条消息
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleExport} disabled={messages.length === 0}>
            <Download className="h-4 w-4 mr-1" />
            导出
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            加载中...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            暂无消息记录
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((msg, i) => {
              const isUser = msg.role === "user";
              return (
                <div key={i} className={cn("flex gap-4", isUser ? "flex-row-reverse" : "flex-row")}>
                  {/* Avatar */}
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mt-1",
                      isUser ? "bg-green-500 text-white" : "bg-blue-500 text-white",
                    )}
                  >
                    {isUser ? "U" : "AI"}
                  </div>

                  <div className={cn("flex-1 min-w-0 space-y-1", isUser && "flex flex-col items-end")}>
                    {/* Task name + time */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium">{msg.task_title}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(msg.timestamp * 1000).toLocaleString("zh-CN", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    {/* Message bubble */}
                    <div
                      className={cn(
                        "rounded-xl px-4 py-3 text-sm",
                        isUser
                          ? "bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100 max-w-[70%]"
                          : "bg-muted max-w-[70%]",
                      )}
                    >
                      {renderContentWithPaths(msg.content) ?? (
                        <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_*]:text-inherit">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
