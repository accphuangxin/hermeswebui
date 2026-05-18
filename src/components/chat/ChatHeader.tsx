import { useTranslation } from "react-i18next";
import { Wifi, WifiOff } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { HermesChatModel } from "@/types";
import { cn } from "@/lib/utils";

interface ChatHeaderProps {
  online: boolean;
  defaultModel: string | null;
  provider: string | null;
  models: HermesChatModel[];
  selectedModel: string;
  onModelChange: (model: string) => void;
}

export function ChatHeader({
  online,
  defaultModel,
  provider,
  models,
  selectedModel,
  onModelChange,
}: ChatHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/20">
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

      {/* Model selector */}
      <div className="flex items-center gap-2 ml-auto">
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
