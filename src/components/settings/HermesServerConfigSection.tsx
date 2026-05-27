import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ServerConfig {
  host: string;
  port: number;
  key: string;
}

export function HermesServerConfigSection() {
  const { t } = useTranslation();
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [key, setKey] = useState("");

  useEffect(() => {
    invoke<ServerConfig>("getHermesApiServerConfig")
      .then((cfg) => {
        setHost(cfg.host);
        setPort(String(cfg.port));
        setKey(cfg.key);
      })
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    try {
      await invoke("setHermesApiServerConfig", { host, port, key });
      toast.success(t("hermes.serverConfig.saved", { defaultValue: "连接配置已保存" }));
    } catch (e) {
      toast.error(t("hermes.serverConfig.saveFailed", { defaultValue: "保存失败" }), { description: String(e) });
    }
  };

  return (
    <section className="space-y-3">
      <header className="space-y-1">
        <h3 className="text-sm font-medium">
          {t("hermes.serverConfig.title", { defaultValue: "Hermes API Server 配置" })}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t("hermes.serverConfig.description", { defaultValue: "配置连接到 Hermes API Server 的地址和认证信息" })}
        </p>
      </header>
      <div className="grid grid-cols-2 gap-3 max-w-sm">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Host</label>
          <Input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="127.0.0.1"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Port</label>
          <Input
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="8643"
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="space-y-1 max-w-sm">
        <label className="text-xs text-muted-foreground">API Key</label>
        <Input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={t("hermes.serverConfig.keyPlaceholder", { defaultValue: "留空则不验证" })}
          className="h-8 text-sm"
        />
      </div>
      <Button size="sm" onClick={handleSave}>
        {t("common.save", { defaultValue: "保存" })}
      </Button>
    </section>
  );
}
