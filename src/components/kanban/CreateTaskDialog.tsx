import { useState } from "react";
import { useCreateTask } from "@/hooks/useKanban";
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

interface CreateTaskDialogProps {
  open: boolean;
  boardSlug: string;
  tasks: any[];
  onClose: () => void;
}

export function CreateTaskDialog({
  open,
  boardSlug,
  onClose,
}: CreateTaskDialogProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState("");

  const createMutation = useCreateTask(boardSlug);

  const handleCreate = async () => {
    if (!title) return;
    await createMutation.mutateAsync({
      title,
      body: body || undefined,
      assignee: assignee || undefined,
      priority: priority ? parseInt(priority) : undefined,
    });
    setTitle("");
    setBody("");
    setAssignee("");
    setPriority("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>创建新任务</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 p-4">
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
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="输入 Agent 名称"
              />
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!title || createMutation.isPending}
          >
            创建任务
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
