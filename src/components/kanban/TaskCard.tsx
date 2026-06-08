import { User, ArrowUp, ArrowDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KanbanTask } from "@/types";

interface TaskCardProps {
  task: KanbanTask;
  onClick: () => void;
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "p-3 rounded-lg border bg-card cursor-pointer",
        "hover:shadow-md transition-shadow",
      )}
    >
      {/* Title and Priority */}
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-medium line-clamp-2 flex-1 pr-2">
          {task.title}
        </h4>
        {task.priority !== undefined && task.priority > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 shrink-0">
            P{task.priority}
          </span>
        )}
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
