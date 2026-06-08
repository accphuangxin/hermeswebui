import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { TaskCard } from "./TaskCard";
import type { KanbanTask } from "@/types";

interface KanbanBoardProps {
  tasks: KanbanTask[];
  isLoading?: boolean;
  onSelectTask: (taskId: string) => void;
}

const COLUMNS = [
  { status: "ready", title: "准备就绪", color: "bg-blue-500" },
  { status: "running", title: "执行中", color: "bg-yellow-500" },
  { status: "blocked", title: "等待中", color: "bg-gray-400" },
  { status: "done", title: "已完成", color: "bg-green-500" },
  { status: "failed", title: "失败", color: "bg-red-500" },
] as const;

export function KanbanBoard({
  tasks,
  isLoading,
  onSelectTask,
}: KanbanBoardProps) {
  const tasksGrouped = useMemo(() => {
    const groups: Record<string, KanbanTask[]> = {
      ready: [],
      running: [],
      blocked: [],
      done: [],
      failed: [],
    };

    tasks.forEach((task) => {
      if (groups[task.status]) {
        groups[task.status].push(task);
      }
    });

    return groups;
  }, [tasks]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground">加载任务中...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 overflow-x-auto">
      <div className="flex gap-4 h-full min-w-max">
        {COLUMNS.map((column) => (
          <div key={column.status} className="w-[280px] flex flex-col">
            {/* Column Header */}
            <div className="mb-3 flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full", column.color)} />
              <h3 className="text-sm font-medium">{column.title}</h3>
              <span className="ml-auto text-xs text-muted-foreground">
                {tasksGrouped[column.status]?.length || 0}
              </span>
            </div>

            {/* Column Content */}
            <ScrollArea className="flex-1 pr-2">
              <div className="space-y-2">
                {tasksGrouped[column.status]?.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    暂无任务
                  </div>
                ) : (
                  tasksGrouped[column.status]?.map((task) => (
                    <TaskCard
                      key={task.task_id}
                      task={task}
                      onClick={() => onSelectTask(task.task_id)}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        ))}
      </div>
    </div>
  );
}
