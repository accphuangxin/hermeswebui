import { X, Edit, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDeleteTask, useUpdateTask } from "@/hooks/useKanban";
import { cn } from "@/lib/utils";
import type { KanbanTask } from "@/types";

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

export function TaskDetailPanel({
  task,
  boardSlug,
  onClose,
}: TaskDetailPanelProps) {
  const deleteMutation = useDeleteTask(boardSlug);
  const updateMutation = useUpdateTask(boardSlug);

  const handleDelete = async () => {
    if (!confirm("确定要删除此任务吗？")) return;
    const taskId = task.id || task.task_id;
    if (!taskId) return;
    await deleteMutation.mutateAsync(taskId);
    onClose();
  };

  const handleRetry = async () => {
    const taskId = task.id || task.task_id;
    if (!taskId) return;
    await updateMutation.mutateAsync({
      taskId,
      input: { status: "ready" },
    });
  };

  return (
    <div className="w-[400px] border-l bg-background flex flex-col">
      {/* Header */}
      <div className="p-4 border-b flex items-start justify-between shrink-0">
        <div className="flex-1 pr-2">
          <div className="flex items-center gap-2 mb-1">
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                STATUS_COLORS[task.status as keyof typeof STATUS_COLORS],
              )}
            />
            <span className="text-xs font-medium text-muted-foreground">
              {STATUS_LABELS[task.status as keyof typeof STATUS_LABELS]}
            </span>
          </div>
          <h2 className="text-lg font-semibold">{task.title}</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Basic Info */}
          <section>
            <h3 className="text-sm font-medium mb-2">基本信息</h3>
            <div className="space-y-2 text-sm">
              <InfoRow label="任务 ID">{task.id || task.task_id}</InfoRow>
              <InfoRow label="分配给">{task.assignee || "未分配"}</InfoRow>
              {task.priority !== undefined && (
                <InfoRow label="优先级">P{task.priority}</InfoRow>
              )}
              <InfoRow label="创建时间">
                {typeof task.created_at === "number"
                  ? new Date(task.created_at * 1000).toLocaleString("zh-CN")
                  : new Date(task.created_at).toLocaleString("zh-CN")}
              </InfoRow>
              {task.started_at && (
                <InfoRow label="开始时间">
                  {typeof task.started_at === "number"
                    ? new Date(task.started_at * 1000).toLocaleString("zh-CN")
                    : new Date(task.started_at).toLocaleString("zh-CN")}
                </InfoRow>
              )}
              {task.completed_at && (
                <InfoRow label="完成时间">
                  {typeof task.completed_at === "number"
                    ? new Date(task.completed_at * 1000).toLocaleString("zh-CN")
                    : new Date(task.completed_at).toLocaleString("zh-CN")}
                </InfoRow>
              )}
            </div>
          </section>

          {/* Dependencies */}
          {((task.parents && task.parents.length > 0) ||
            (task.children && task.children.length > 0)) && (
            <section>
              <h3 className="text-sm font-medium mb-2">依赖关系</h3>
              <div className="space-y-2">
                {task.parents && task.parents.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      依赖任务 ({task.parents.length})
                    </p>
                    <div className="space-y-1">
                      {task.parents.map((parentId) => (
                        <div
                          key={parentId}
                          className="text-xs px-2 py-1 rounded bg-muted"
                        >
                          {parentId}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {task.children && task.children.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      后续任务 ({task.children.length})
                    </p>
                    <div className="space-y-1">
                      {task.children.map((childId) => (
                        <div
                          key={childId}
                          className="text-xs px-2 py-1 rounded bg-muted"
                        >
                          {childId}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Description */}
          {task.body && (
            <section>
              <h3 className="text-sm font-medium mb-2">任务描述</h3>
              <div className="text-sm whitespace-pre-wrap bg-muted p-3 rounded">
                {task.body}
              </div>
            </section>
          )}

          {/* Result */}
          {task.result && (
            <section>
              <h3 className="text-sm font-medium mb-2">执行结果</h3>
              <div className="text-sm whitespace-pre-wrap bg-muted p-3 rounded max-h-[300px] overflow-y-auto">
                {task.result}
              </div>
            </section>
          )}
        </div>
      </ScrollArea>

      {/* Actions */}
      <div className="p-4 border-t flex gap-2 shrink-0">
        <Button variant="outline" size="sm" className="flex-1">
          <Edit className="h-4 w-4 mr-1" />
          编辑
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          删除
        </Button>
        {task.status === "failed" && (
          <Button
            size="sm"
            onClick={handleRetry}
            disabled={updateMutation.isPending}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            重试
          </Button>
        )}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
