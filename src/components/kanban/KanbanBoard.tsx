import { useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { TaskCard } from "./TaskCard";
import { Trash2, RotateCcw, Play } from "lucide-react";
import type { KanbanTask } from "@/types";

interface KanbanBoardProps {
  tasks: KanbanTask[];
  isLoading?: boolean;
  onSelectTask: (taskId: string) => void;
  onResetTask?: (taskId: string) => void;
  onExecuteTask?: (taskId: string) => void;
  onUnblockTask?: (taskId: string) => void;
  onBatchDelete?: (taskIds: string[]) => void;
  onBatchReset?: (taskIds: string[]) => void;
  onBatchExecute?: (taskIds: string[]) => void;
  isSelectionMode?: boolean;
  onSelectionModeChange?: (mode: boolean) => void;
}

const COLUMNS = [
  { status: "ready", title: "准备就绪", color: "bg-blue-500" },
  { status: "running", title: "执行中", color: "bg-yellow-500" },
  { status: "blocked", title: "等待中", color: "bg-gray-400" },
  { status: "done", title: "已完成", color: "bg-green-500" },
] as const;

export function KanbanBoard({
  tasks,
  isLoading,
  onSelectTask,
  onResetTask,
  onExecuteTask,
  onUnblockTask,
  onBatchDelete,
  onBatchReset,
  onBatchExecute,
  isSelectionMode = false,
  onSelectionModeChange,
}: KanbanBoardProps) {
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    new Set(),
  );

  const tasksGrouped = useMemo(() => {
    const groups: Record<string, KanbanTask[]> = {
      ready: [],
      running: [],
      blocked: [],
      done: [],
    };

    tasks.forEach((task) => {
      // 将 failed 状态的任务也放入 done 列
      if (task.status === "failed") {
        groups.done.push(task);
      } else if (groups[task.status]) {
        groups[task.status].push(task);
      }
    });

    return groups;
  }, [tasks]);

  const toggleTaskSelection = (taskId: string) => {
    const newSelected = new Set(selectedTaskIds);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTaskIds(newSelected);
  };

  const selectAll = () => {
    const allTaskIds = tasks
      .map((t) => t.id || t.task_id || "")
      .filter(Boolean);
    setSelectedTaskIds(new Set(allTaskIds));
  };

  const clearSelection = () => {
    setSelectedTaskIds(new Set());
  };

  const handleBatchDelete = () => {
    if (selectedTaskIds.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedTaskIds.size} 个任务吗？`)) return;
    onBatchDelete?.(Array.from(selectedTaskIds));
    clearSelection();
    onSelectionModeChange?.(false);
  };

  const handleBatchReset = () => {
    if (selectedTaskIds.size === 0) return;
    if (!confirm(`确定要重置选中的 ${selectedTaskIds.size} 个任务吗？`)) return;
    onBatchReset?.(Array.from(selectedTaskIds));
    clearSelection();
    onSelectionModeChange?.(false);
  };

  const handleBatchExecute = () => {
    if (selectedTaskIds.size === 0) return;
    if (!confirm(`确定要执行选中的 ${selectedTaskIds.size} 个任务吗？`)) return;
    onBatchExecute?.(Array.from(selectedTaskIds));
    clearSelection();
    onSelectionModeChange?.(false);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground">加载任务中...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Batch Operations Toolbar */}
      {isSelectionMode && (
        <div className="border-b px-4 py-2 flex items-center gap-2 bg-muted/50 shrink-0">
          <Checkbox
            checked={selectedTaskIds.size === tasks.length && tasks.length > 0}
            onCheckedChange={(checked) => {
              if (checked) {
                selectAll();
              } else {
                clearSelection();
              }
            }}
          />
          <span className="text-sm text-muted-foreground">
            已选择 {selectedTaskIds.size} 个任务
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleBatchExecute}
              disabled={selectedTaskIds.size === 0}
            >
              <Play className="h-4 w-4 mr-1" />
              批量执行
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBatchReset}
              disabled={selectedTaskIds.size === 0}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              批量重置
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBatchDelete}
              disabled={selectedTaskIds.size === 0}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              批量删除
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <div className="flex gap-0 h-full">
          {COLUMNS.map((column) => (
            <div
              key={column.status}
              className="flex-1 min-w-[200px] flex flex-col border-r last:border-r-0"
            >
              {/* Column Header */}
              <div className="h-12 px-3 border-b flex items-center gap-2 shrink-0 bg-muted/30">
                {isSelectionMode && (
                  <Checkbox
                    checked={
                      tasksGrouped[column.status]?.length > 0 &&
                      tasksGrouped[column.status]?.every((t) =>
                        selectedTaskIds.has(t.id || t.task_id || ""),
                      )
                    }
                    onCheckedChange={(checked) => {
                      const newSelected = new Set(selectedTaskIds);
                      tasksGrouped[column.status]?.forEach((t) => {
                        const id = t.id || t.task_id || "";
                        if (checked) {
                          newSelected.add(id);
                        } else {
                          newSelected.delete(id);
                        }
                      });
                      setSelectedTaskIds(newSelected);
                    }}
                  />
                )}
                <div
                  className={cn("w-2 h-2 rounded-full shrink-0", column.color)}
                />
                <h3 className="text-sm font-medium">{column.title}</h3>
                <span className="ml-auto text-xs text-muted-foreground shrink-0">
                  {tasksGrouped[column.status]?.length || 0}
                </span>
              </div>

              {/* Column Content */}
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-2">
                  {tasksGrouped[column.status]?.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-8">
                      暂无任务
                    </div>
                  ) : (
                    tasksGrouped[column.status]?.map((task) => {
                      const taskId = task.id || task.task_id || "";
                      return (
                        <div key={taskId} className="flex items-start gap-2">
                          {isSelectionMode && (
                            <Checkbox
                              checked={selectedTaskIds.has(taskId)}
                              onCheckedChange={() =>
                                toggleTaskSelection(taskId)
                              }
                              className="mt-3"
                            />
                          )}
                          <div className="flex-1">
                            <TaskCard
                              task={task}
                              onClick={() =>
                                !isSelectionMode && onSelectTask(taskId)
                              }
                              onReset={onResetTask}
                              onExecute={onExecuteTask}
                              onUnblock={onUnblockTask}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
