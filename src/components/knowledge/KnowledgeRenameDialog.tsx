import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface KnowledgeRenameDialogProps {
  isOpen: boolean;
  currentName: string;
  isDir: boolean;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}

export function KnowledgeRenameDialog({
  isOpen,
  currentName,
  isDir,
  onConfirm,
  onCancel,
}: KnowledgeRenameDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(currentName);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      setError("");
    }
  }, [isOpen, currentName]);

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("knowledge.nameRequired"));
      return;
    }
    if (!isDir && !trimmed.endsWith(".md")) {
      setError(t("knowledge.mdOnly"));
      return;
    }
    onConfirm(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleConfirm();
    if (e.key === "Escape") onCancel();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("knowledge.rename")}</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-4 space-y-3">
          <Label className="text-sm">{t("knowledge.newName")}</Label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            onKeyDown={handleKeyDown}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleConfirm}>{t("common.confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
