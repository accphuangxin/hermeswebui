import { useState } from "react";
import { useCreateBoard } from "@/hooks/useKanban";
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

interface CreateBoardDialogProps {
  open: boolean;
  onClose: () => void;
}

const DEFAULT_ICONS = ["📋", "🎯", "🚀", "💼", "🏥", "🔧", "📊", "🌟"];

export function CreateBoardDialog({ open, onClose }: CreateBoardDialogProps) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("📋");

  const createMutation = useCreateBoard();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug || !name) return;

    await createMutation.mutateAsync({
      slug,
      name,
      description: description || undefined,
      icon,
    });

    // Reset form
    setSlug("");
    setName("");
    setDescription("");
    setIcon("📋");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>创建新看板</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="slug">看板标识 (slug) *</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="health-family"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              英文字母、数字和连字符，用于 URL
            </p>
          </div>

          <div>
            <Label htmlFor="name">看板名称 *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="家庭健康档案"
              required
            />
          </div>

          <div>
            <Label htmlFor="description">描述（可选）</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="健康管理工作流"
              rows={2}
            />
          </div>

          <div>
            <Label>图标</Label>
            <div className="flex gap-2 mt-2">
              {DEFAULT_ICONS.map((ico) => (
                <button
                  key={ico}
                  type="button"
                  onClick={() => setIcon(ico)}
                  className={`w-10 h-10 rounded border-2 flex items-center justify-center text-xl hover:bg-accent transition-colors ${
                    icon === ico ? "border-primary" : "border-input"
                  }`}
                >
                  {ico}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
