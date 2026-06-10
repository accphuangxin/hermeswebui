import { useState } from "react";
import { useCreateTask, useLinkTasks } from "@/hooks/useKanban";
import { useHermesAgents } from "@/hooks/useHermesChat";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { KanbanTask } from "@/types";

interface CreateTaskDialogProps {
  open: boolean;
  boardSlug: string;
  tasks: KanbanTask[];
  onClose: () => void;
}

export function CreateTaskDialog({
  open,
  boardSlug,
  tasks,
  onClose,
}: CreateTaskDialogProps) {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState("");
  const [selectedParents, setSelectedParents] = useState<string[]>([]);

  const createMutation = useCreateTask(boardSlug);
  const linkMutation = useLinkTasks(boardSlug);
  const { data: agents = [] } = useHermesAgents();

  const availableTasks = tasks.filter((t) => t.status !== "failed");

  const toggleParent = (taskId: string) => {
    setSelectedParents((prev) =>
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId],
    );
  };

  const handleCreate = async () => {
    if (!title) return;

    // Create task
    const newTask = await createMutation.mutateAsync({
      title,
      body: body || undefined,
      assignee: assignee || undefined,
      priority: priority ? parseInt(priority) : undefined,
    });

    // Link dependencies
    const childId = newTask.id || newTask.task_id;
    if (childId && selectedParents.length > 0) {
      for (const parentId of selectedParents) {
        await linkMutation.mutateAsync({ parentId, childId });
      }
    }

    // Reset
    setStep(1);
    setTitle("");
    setBody("");
    setAssignee("");
    setPriority("");
    setSelectedParents([]);
    onClose();
  };

  const handleBack = () => {
    setStep(1);
  };

  const handleNext = () => {
    if (!title) return;
    setStep(2);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>创建新任务 - 步骤 {step}/2</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 p-4">
          {step === 1 && (
            <>
              <div>
                <Label htmlFor="title">任务标题 *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="输入任务标题"
                />
              </div>

              <div>
                <Label htmlFor="body">任务描述</Label>
                <Textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="输入任务描述"
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="assignee">分配给 Agent</Label>
                  <Input
                    id="assignee"
                    list="agents-list"
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    placeholder="选择或输入 Agent 名称"
                  />
                  <datalist id="agents-list">
                    {agents.map((agent) => (
                      <option key={agent.name} value={agent.name} />
                    ))}
                  </datalist>
                  {agents.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      可用: {agents.map((a) => a.name).join(", ")}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="priority">优先级 (0-10)</Label>
                  <Input
                    id="priority"
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    placeholder="0-10"
                    min="0"
                    max="10"
                  />
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <div>
              <Label>依赖任务（可选）</Label>
              <p className="text-sm text-muted-foreground mb-3">
                选择此任务依赖的父任务，只有父任务完成后此任务才会开始执行
              </p>

              <ScrollArea className="h-[300px] border rounded-md p-3">
                {availableTasks.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    暂无可用任务
                  </div>
                ) : (
                  <div className="space-y-2">
                    {availableTasks.map((task) => {
                      const taskId = task.id || task.task_id || "";
                      return (
                        <label
                          key={taskId}
                          className="flex items-start gap-3 p-2 hover:bg-accent rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedParents.includes(taskId)}
                            onChange={() => toggleParent(taskId)}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">
                              {task.title}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {taskId} • {task.status}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>

              {selectedParents.length > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  已选择 {selectedParents.length} 个依赖任务
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 2 && (
            <Button variant="outline" onClick={handleBack}>
              上一步
            </Button>
          )}
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button onClick={handleNext} disabled={!title}>
                下一步
              </Button>
            </>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || linkMutation.isPending}
            >
              创建任务
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
