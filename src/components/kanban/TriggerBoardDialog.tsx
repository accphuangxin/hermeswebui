import { useState } from "react";
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

interface TriggerBoardDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (options: {
    assignee?: string;
    max_tasks?: number;
    initial_prompt?: string;
  }) => void;
  isPending: boolean;
}

export function TriggerBoardDialog({
  open,
  onClose,
  onConfirm,
  isPending,
}: TriggerBoardDialogProps) {
  const [assignee, setAssignee] = useState("");
  const [maxTasks, setMaxTasks] = useState("");
  const [initialPrompt, setInitialPrompt] = useState("");

  const handleSubmit = () => {
    const options: {
      assignee?: string;
      max_tasks?: number;
      initial_prompt?: string;
    } = {};

    if (assignee.trim()) {
      options.assignee = assignee.trim();
    }

    if (maxTasks && !isNaN(Number(maxTasks))) {
      options.max_tasks = Number(maxTasks);
    }

    if (initialPrompt.trim()) {
      options.initial_prompt = initialPrompt.trim();
    }

    onConfirm(options);
    handleClose();
  };

  const handleClose = () => {
    setAssignee("");
    setMaxTasks("");
    setInitialPrompt("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>触发看板工作流</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="assignee">智能体名称（可选）</Label>
            <Input
              id="assignee"
              placeholder="例如: agent-name"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              仅处理分配给该智能体的任务
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max_tasks">最大任务数（可选）</Label>
            <Input
              id="max_tasks"
              type="number"
              placeholder="默认: 10"
              value={maxTasks}
              onChange={(e) => setMaxTasks(e.target.value)}
              min="1"
            />
            <p className="text-xs text-muted-foreground">
              限制单次触发处理的任务数量
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="initial_prompt">初始化提示词（可选）</Label>
            <Textarea
              id="initial_prompt"
              placeholder="在任务开始时发送的初始提示词..."
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              在执行任务前发送给智能体的初始化指令
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "触发中..." : "触发"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
