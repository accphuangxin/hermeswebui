import { useState } from "react";
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

interface KnowledgeNewItemDialogProps {
  isOpen: boolean;
  type: "file" | "folder";
  parentRelPath: string;
  onConfirm: (relPath: string) => void;
  onCancel: () => void;
}

export function KnowledgeNewItemDialog({
  isOpen,
  type,
  parentRelPath,
  onConfirm,
  onCancel,
}: KnowledgeNewItemDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("knowledge.nameRequired"));
      return;
    }
    if (type === "file" && !trimmed.endsWith(".md")) {
      const fullName = trimmed + ".md";
      const relPath = parentRelPath
        ? `${parentRelPath}/${fullName}`
        : fullName;
      setName("");
      setError("");
      onConfirm(relPath);
      return;
    }
    const relPath = parentRelPath ? `${parentRelPath}/${trimmed}` : trimmed;
    setName("");
    setError("");
    onConfirm(relPath);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleConfirm();
    if (e.key === "Escape") {
      setName("");
      setError("");
      onCancel();
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setName("");
      setError("");
      onCancel();
    }
  };

  const placeholder =
    type === "file"
      ? t("knowledge.fileNamePlaceholder")
      : t("knowledge.folderNamePlaceholder");

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {type === "file" ? t("knowledge.newFile") : t("knowledge.newFolder")}
          </DialogTitle>
        </DialogHeader>
        <div className="px-6 py-4 space-y-3">
          <Label className="text-sm">
            {type === "file" ? t("knowledge.newFileName") : t("knowledge.newFolderName")}
          </Label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleConfirm}>{t("common.confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
