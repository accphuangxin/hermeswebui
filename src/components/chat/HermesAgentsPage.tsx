import { Check, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useHermesAgents } from "@/hooks/useHermesChat";
import type { HermesAgent } from "@/lib/api/agents";

interface HermesAgentsPageProps {
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null, port?: number, key?: string) => void;
  onBack: () => void;
  apiConfigHost: string;
  apiConfigPort: string;
  apiConfigKey: string;
  onApiConfigHostChange: (v: string) => void;
  onApiConfigPortChange: (v: string) => void;
  onApiConfigKeyChange: (v: string) => void;
  onApiConfigSave: () => void;
}

export function HermesAgentsPage({
  selectedAgentId, onSelectAgent, onBack,
  apiConfigHost, apiConfigPort, apiConfigKey,
  onApiConfigHostChange, onApiConfigPortChange, onApiConfigKeyChange,
  onApiConfigSave,
}: HermesAgentsPageProps) {
  const { t } = useTranslation();
  const { data: agents = [], isLoading, isError, error, refetch, isFetching } = useHermesAgents();

  const seen = new Set<string>();
  const allItems: Array<{ id: string | null; name: string; description?: string; model?: string; port?: number; key?: string }> =
    agents
      .filter((a: HermesAgent) => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      })
      .map((a: HermesAgent) => ({
        id: a.isDefault ? null : a.id,
        name: a.name ?? a.alias ?? a.id,
        description: a.description,
        model: a.model ?? (a.provider ? `${a.provider}` : undefined),
        port: a.apiServerPort,
        key: a.apiServerKey,
      }));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Refresh button row */}
      <div className="flex items-center justify-end px-4 pt-2 pb-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-6">
        {/* Agent cards */}
        <div>
          {isLoading ? (
            <EmptyState pulse>{t("common.loading", { defaultValue: "加载中..." })}</EmptyState>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center h-40 text-center gap-3">
              <p className="text-sm text-muted-foreground">
                {t("hermes.agents.loadError", { defaultValue: "加载失败" })}
              </p>
              {error && (
                <p className="text-xs text-destructive/80 max-w-sm break-all font-mono">{String(error)}</p>
              )}
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void refetch()}>
                {t("hermes.agents.retry", { defaultValue: "重试" })}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
              {allItems.map((item) => (
                <AgentCard
                  key={item.id ?? "__default__"}
                  name={item.name}
                  description={item.description}
                  model={item.model}
                  isSelected={selectedAgentId === item.id}
                  onSelect={() => { onSelectAgent(item.id, item.port, item.key); }}
                />
              ))}
            </div>
          )}
        </div>

        {/* API Server config section */}
        <div className="border-t border-border/50 pt-4 space-y-3">
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
              onKeyDown={(e) => { if (e.key === "Enter") { onApiConfigSave(); onBack(); } }}
            />
          </div>
          <Button size="sm" className="w-full h-8 text-xs" onClick={() => { onApiConfigSave(); onBack(); }}>
            {t("common.save", { defaultValue: "保存" })}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ children, pulse }: { children: React.ReactNode; pulse?: boolean }) {
  return (
    <div className="flex items-center justify-center h-40">
      <p className={cn("text-sm text-muted-foreground", pulse && "animate-pulse")}>{children}</p>
    </div>
  );
}

interface AgentCardProps {
  name: string;
  description?: string;
  model?: string;
  isSelected: boolean;
  onSelect: () => void;
}

function AgentCard({ name, description, model, isSelected, onSelect }: AgentCardProps) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "relative flex flex-col gap-1.5 p-3 rounded-xl border text-left transition-all",
        "hover:border-primary/50 hover:bg-accent/40",
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border bg-card",
      )}
    >
      {isSelected && (
        <Check className="absolute top-2.5 right-2.5 w-3.5 h-3.5 text-primary" />
      )}
      <p className="text-sm font-semibold leading-snug pr-5 truncate">{name}</p>
      {description && (
        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{description}</p>
      )}
      {model && (
        <p className="text-[10px] text-muted-foreground/50 font-mono truncate mt-auto pt-1">{model}</p>
      )}
    </button>
  );
}
