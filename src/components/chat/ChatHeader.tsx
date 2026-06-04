import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Wifi, WifiOff, Sparkles, Settings2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { HermesChatModel } from "@/types";
import { cn } from "@/lib/utils";

interface ChatHeaderProps {
  online: boolean;
  defaultModel: string | null;
  provider: string | null;
  models: HermesChatModel[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  onNavigateSkills?: () => void;
  apiConfigHost: string;
  apiConfigPort: string;
  apiConfigKey: string;
  onApiConfigHostChange: (v: string) => void;
  onApiConfigPortChange: (v: string) => void;
  onApiConfigKeyChange: (v: string) => void;
  onApiConfigSave: () => void;
}

export function ChatHeader({
  online,
  defaultModel,
  provider,
  models,
  selectedModel,
  onModelChange,
  onNavigateSkills,
  apiConfigHost,
  apiConfigPort,
  apiConfigKey,
  onApiConfigHostChange,
  onApiConfigPortChange,
  onApiConfigKeyChange,
  onApiConfigSave,
}: ChatHeaderProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-3 px-4 h-10 border-b bg-muted/20 shrink-0">
      {/* Connection status */}
      <div className="flex items-center gap-1.5">
        {online ? (
          <Wifi className="w-3.5 h-3.5 text-green-500" />
        ) : (
          <WifiOff className="w-3.5 h-3.5 text-destructive" />
        )}
        <span
          className={cn(
            "text-xs font-medium",
            online ? "text-green-600 dark:text-green-400" : "text-destructive",
          )}
        >
          {online ? t("hermes.chat.connected") : t("hermes.chat.disconnected")}
        </span>
      </div>

      {/* Active model info */}
      <span className="text-xs text-muted-foreground">
        {selectedModel
          ? selectedModel.replace(/^custom_/, "").replace(":", " / ")
          : provider
            ? `${provider} / ${defaultModel}`
            : defaultModel || ""}
      </span>

      {/* Right side controls */}
      <div className="flex items-center gap-1.5 ml-auto">
        {/* API Server config popover */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7" title="API Server 配置">
              <Settings2 className="w-3.5 h-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("hermes.serverConfig.title", { defaultValue: "API Server 配置" })}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Host</label>
                <Input
                  value={apiConfigHost}
                  onChange={(e) => onApiConfigHostChange(e.target.value)}
                  placeholder="127.0.0.1"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Port</label>
                <Input
                  value={apiConfigPort}
                  onChange={(e) => onApiConfigPortChange(e.target.value)}
                  placeholder="8643"
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">API Key</label>
              <Input
                type="password"
                value={apiConfigKey}
                onChange={(e) => onApiConfigKeyChange(e.target.value)}
                placeholder={t("hermes.serverConfig.keyPlaceholder", { defaultValue: "留空则不验证" })}
                className="h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") { onApiConfigSave(); setOpen(false); }
                }}
              />
            </div>
            <Button
              size="sm"
              className="w-full h-8 text-xs"
              onClick={() => { onApiConfigSave(); setOpen(false); }}
            >
              {t("common.save", { defaultValue: "保存" })}
            </Button>
          </PopoverContent>
        </Popover>

        {onNavigateSkills && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onNavigateSkills}
            title={t("skills.title", { defaultValue: "Skills 管理" })}
          >
            <Sparkles className="w-3.5 h-3.5" />
          </Button>
        )}

        {/* Model selector */}
        <Select
          value={selectedModel}
          onValueChange={onModelChange}
          disabled={!online || models.length === 0}
        >
          <SelectTrigger className="h-7 w-[220px] text-xs">
            <SelectValue placeholder={t("hermes.chat.selectModel")} />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem
                key={`${m.provider}/${m.id}`}
                value={`custom_${m.provider}:${m.id}`}
                className="text-xs"
              >
                <span>{m.id}</span>
                <span className="ml-2 text-muted-foreground">({m.provider})</span>
                {m.isDefault && (
                  <span className="ml-1.5 text-[10px] text-primary font-medium">●</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
