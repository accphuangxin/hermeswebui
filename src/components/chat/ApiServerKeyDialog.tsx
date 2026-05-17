import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-sm focus:outline-none"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-muted-foreground shrink-0" />
          <h3 className="font-semibold text-sm">
            {t("hermes.apiKey.title", { defaultValue: "配置 API Server Key" })}
          </h3>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed mb-4">
          {t("hermes.apiKey.description", {
            defaultValue: "Hermes 服务端配置了认证 Key，请输入 API_SERVER_KEY 以正常使用聊天功能。",
          })}
        </p>

        {/* Input */}
        <Input
          type="password"
          placeholder="API_SERVER_KEY"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); }}
          autoFocus
          className="text-sm"
        />

        {error && <p className="text-xs text-destructive mt-1.5">{error}</p>}

        <p className="text-xs text-muted-foreground mt-2">
          {t("hermes.apiKey.hint", {
            defaultValue: "将写入 ~/.hermes/.env，与 hermes config set API_SERVER_KEY 效果相同。",
          })}
        </p>

        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" size="sm" onClick={onSaved}>
            {t("hermes.apiKey.skip", { defaultValue: "跳过" })}
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={saving || !key.trim()}
          >
            {saving
              ? t("hermes.apiKey.saving", { defaultValue: "保存中..." })
              : t("hermes.apiKey.save", { defaultValue: "保存" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
