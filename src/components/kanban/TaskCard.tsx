import { User, ArrowUp, ArrowDown, Clock, RotateCcw, Play, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KanbanTask } from "@/types";

interface TaskCardProps {
  task: KanbanTask;
  onClick: () => void;
  onReset?: (taskId: string) => void;
  onExecute?: (taskId: string) => void;
  onUnblock?: (taskId: string) => void;
}

export function TaskCard({ task, onClick, onReset, onExecute, onUnblock }: TaskCardProps) {
  const taskId = task.id || task.task_id || "";
  const isRootTask = !task.parents || task.parents.length === 0;
  const isDone = task.status === "done" || task.status === "failed";
  const isReady = task.status === "ready";
  const isBlocked = task.status === "blocked";

  const handleResetClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止触发 onClick
    if (onReset && taskId) {
      onReset(taskId);
    }
  };

  const handleExecuteClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止触发 onClick
    if (onExecute && taskId) {
      onExecute(taskId);
    }
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "p-3 rounded-lg border bg-card cursor-pointer",
        "hover:shadow-md transition-shadow",
      )}
    >
      {/* Title and Action Buttons */}
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-medium line-clamp-2 flex-1 pr-2">
          {task.title}
        </h4>
        <div className="flex items-center gap-1 shrink-0">
          {isBlocked && onUnblock && (
            <button
              onClick={(e) => { e.stopPropagation(); onUnblock(taskId); }}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 rounded transition-colors"
              title="人工审核通过，继续执行"
            >
              <CheckCircle className="h-3 w-3" />
              审核通过
            </button>
          )}
          {isRootTask && isReady && onExecute && (
            <button
              onClick={handleExecuteClick}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-green-50 hover:bg-green-100 text-green-700 rounded transition-colors"
              title="执行任务"
            >
              <Play className="h-3 w-3" />
              执行
            </button>
          )}
          {isRootTask && isDone && onReset && (
            <button
              onClick={handleResetClick}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded transition-colors"
              title="重置任务及所有子任务"
            >
              <RotateCcw className="h-3 w-3" />
              重置
            </button>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        {task.assignee && (
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {task.assignee}
          </span>
        )}

        {task.parents && task.parents.length > 0 && (
          <span className="flex items-center gap-1" title="依赖的父任务">
            <ArrowUp className="h-3 w-3" />
            {task.parents.length}
          </span>
        )}

        {task.children && task.children.length > 0 && (
          <span className="flex items-center gap-1" title="后续子任务">
            <ArrowDown className="h-3 w-3" />
            {task.children.length}
          </span>
        )}

        {task.started_at && (
          <span className="flex items-center gap-1" title="开始时间">
            <Clock className="h-3 w-3" />
            {new Date(task.started_at).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>

      {/* Task ID (small) */}
      <div className="mt-2 text-xs text-muted-foreground/60">
        {task.id || task.task_id}
      </div>
    </div>
  );
}
