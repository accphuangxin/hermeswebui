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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  const nonFailedTasks = tasks.filter((t) => t.status !== "failed");

  const toggleParent = (taskId: string, checked: boolean) => {
    setSelectedParents((prev) =>
      checked ? [...prev, taskId] : prev.filter((id) => id !== taskId)
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
    for (const parentId of selectedParents) {
      await linkMutation.mutateAsync({ parentId, childId: newTask.task_id });
    }

    // Reset form
    setStep(1);
    setTitle("");
    setBody("");
    setAssignee("");
    setPriority("");
    setSelectedParents([]);
    onClose();
  };

  const handleClose = () => {
    setStep(1);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>创建新任务 - 步骤 {step}/2</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">任务标题 *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="数据分析 - 血脂/血糖/肝功能"
                required
              />
            </div>

            <div>
              <Label htmlFor="body">任务描述</Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="分析体检数据，识别异常指标的严重程度"
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="assignee">分配给</Label>
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger id="assignee">
                    <SelectValue placeholder="选择 Agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">不分配</SelectItem>
                    {agents.map((agent) => (
                      <SelectItem key={agent.name} value={agent.name}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="priority">优先级</Label>
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
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label>依赖任务（可选）</Label>
              <p className="text-sm text-muted-foreground mt-1 mb-3">
                选择此任务依赖的父任务，只有父任务完成后此任务才会开始执行
              </p>

              <ScrollArea className="h-[300px] border rounded-md p-3">
                {nonFailedTasks.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    暂无可用任务
                  </div>
                ) : (
                  <div className="space-y-2">
                    {nonFailedTasks.map((task) => (
                      <label
                        key={task.task_id}
                        className="flex items-start gap-3 p-2 hover:bg-accent rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedParents.includes(task.task_id)}
                          onChange={(e) =>
                            toggleParent(task.task_id, e.target.checked)
                          }
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">
                            {task.title}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {task.task_id} • {task.status}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {selectedParents.length > 0 && (
                <div className="mt-2 text-sm text-muted-foreground">
                  已选择 {selectedParents.length} 个依赖任务
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {step > 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(step - 1)}
            >
              上一步
            </Button>
          )}
          {step < 2 ? (
            <Button onClick={() => setStep(2)} disabled={!title}>
              下一步
            </Button>
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
