import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Wifi, WifiOff, Bug } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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

interface HermesConfigDebug {
  configPath: string;
  pathExists: boolean;
  rawContent: string;
  customProvidersFound: boolean;
  providerCount: number;
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
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugInfo, setDebugInfo] = useState<HermesConfigDebug | null>(null);

  const handleDebug = async () => {
    const info = await invoke<HermesConfigDebug>("debugHermesConfig");
    setDebugInfo(info);
    setDebugOpen(true);
  };

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
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleDebug}
          title="调试配置"
        >
          <Bug className="w-3.5 h-3.5 text-muted-foreground" />
        </Button>
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
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Dialog open={debugOpen} onOpenChange={setDebugOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Hermes 配置调试</DialogTitle>
          </DialogHeader>
          {debugInfo && (
            <div className="space-y-3 text-xs font-mono">
              <div>
                <span className="text-muted-foreground">配置文件路径：</span>
                <span className={debugInfo.pathExists ? "text-green-500" : "text-red-500"}>
                  {debugInfo.configPath}
                </span>
                <span className="ml-2 text-muted-foreground">
                  ({debugInfo.pathExists ? "文件存在" : "文件不存在"})
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">custom_providers：</span>
                <span className={debugInfo.customProvidersFound ? "text-green-500" : "text-red-500"}>
                  {debugInfo.customProvidersFound
                    ? `找到 ${debugInfo.providerCount} 个`
                    : "未找到"}
                </span>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">config.yaml 原始内容：</div>
                <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-[400px] whitespace-pre-wrap break-all">
                  {debugInfo.rawContent}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
