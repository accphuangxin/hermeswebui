import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ApiServerKeyDialogProps {
  open: boolean;
  onSaved: () => void;
}

export function ApiServerKeyDialog({ open, onSaved }: ApiServerKeyDialogProps) {
  const { t } = useTranslation();
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await invoke("setHermesApiServerKey", { key: key.trim() });
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    onSaved();
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-4 h-4" />
            {t("hermes.apiKey.title", { defaultValue: "配置 Hermes API Server Key" })}
          </DialogTitle>
          <DialogDescription>
            {t("hermes.apiKey.description", {
              defaultValue:
                "检测到 Hermes API Server 需要认证。请输入 ~/.hermes/.env 中配置的 API_SERVER_KEY，或留空跳过。",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="api-server-key">API_SERVER_KEY</Label>
            <Input
              id="api-server-key"
              type="password"
              placeholder={t("hermes.apiKey.placeholder", { defaultValue: "输入 API Server Key..." })}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSave();
              }}
              autoFocus
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">
            {t("hermes.apiKey.hint", {
              defaultValue: "此 Key 将保存到 ~/.hermes/.env 文件，与 hermes config set API_SERVER_KEY 效果相同。",
            })}
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={handleSkip}>
            {t("hermes.apiKey.skip", { defaultValue: "跳过" })}
          </Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={saving || !key.trim()}>
            {saving
              ? t("hermes.apiKey.saving", { defaultValue: "保存中..." })
              : t("hermes.apiKey.save", { defaultValue: "保存" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
