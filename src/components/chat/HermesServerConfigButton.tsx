import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface ServerConfig {
  host: string;
  port: number;
  key: string;
}

export function HermesServerConfigButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [key, setKey] = useState("");

  useEffect(() => {
    if (open) {
      invoke<ServerConfig>("getHermesApiServerConfig")
        .then((cfg) => {
          setHost(cfg.host);
          setPort(String(cfg.port));
          setKey(cfg.key);
        })
        .catch(console.error);
    }
  }, [open]);

  const handleSave = async () => {
    try {
      await invoke("setHermesApiServerConfig", { host, port, key });
      toast.success(t("hermes.serverConfig.saved", { defaultValue: "连接配置已保存" }));
      setOpen(false);
    } catch (e) {
      toast.error(t("hermes.serverConfig.saveFailed", { defaultValue: "保存失败" }), { description: String(e) });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          title={t("hermes.serverConfig.title", { defaultValue: "API Server 配置" })}
        >
          <Settings2 className="w-3.5 h-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" align="end">
        <p className="text-sm font-medium mb-3">
          {t("hermes.serverConfig.title", { defaultValue: "API Server 配置" })}
        </p>
        <div className="space-y-2.5">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Host</label>
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="127.0.0.1"
              className="w-full text-sm rounded-md border bg-transparent px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Port</label>
            <input
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="8643"
              className="w-full text-sm rounded-md border bg-transparent px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">API Key</label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={t("hermes.serverConfig.keyPlaceholder", { defaultValue: "留空则不验证" })}
              className="w-full text-sm rounded-md border bg-transparent px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <Button size="sm" className="w-full mt-1" onClick={handleSave}>
            {t("common.save", { defaultValue: "保存" })}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
