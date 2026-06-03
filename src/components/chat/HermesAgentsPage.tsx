import { ArrowLeft, Check, RefreshCw, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useHermesAgents } from "@/hooks/useHermesChat";
import type { HermesAgent } from "@/lib/api/agents";

interface HermesAgentsPageProps {
  isOnline: boolean;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  onBack: () => void;
}

export function HermesAgentsPage({ isOnline, selectedAgentId, onSelectAgent, onBack }: HermesAgentsPageProps) {
  const { t } = useTranslation();
  const { data: agents = [], isLoading, isError, error, refetch, isFetching } = useHermesAgents(isOnline);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onBack}>
          <ArrowLeft className="w-3.5 h-3.5" />
        </Button>
        <Users className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-sm font-medium flex-1">
          {t("hermes.agents.title", { defaultValue: "选择智能体" })}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => void refetch()}
          disabled={isFetching}
          title={t("hermes.agents.retry", { defaultValue: "刷新" })}
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-2">
        {!isOnline ? (
          <div className="flex flex-col items-center justify-center h-40 text-center px-6 gap-2">
            <p className="text-sm text-muted-foreground">
              {t("hermes.agents.offline", { defaultValue: "服务未连接" })}
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center h-40 text-center px-6 gap-2">
            <p className="text-sm text-muted-foreground animate-pulse">
              {t("common.loading", { defaultValue: "加载中..." })}
            </p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-40 text-center px-6 gap-3">
            <p className="text-sm text-muted-foreground">
              {t("hermes.agents.loadError", { defaultValue: "加载失败" })}
            </p>
            {error && (
              <p className="text-xs text-destructive/80 max-w-xs break-all font-mono">{String(error)}</p>
            )}
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void refetch()}>
              {t("hermes.agents.retry", { defaultValue: "重试" })}
            </Button>
          </div>
        ) : (
          <>
            {/* Default option */}
            <AgentRow
              id={null}
              name={t("hermes.agents.default", { defaultValue: "默认" })}
              description={t("hermes.agents.defaultHint", { defaultValue: "由服务端决定" })}
              isSelected={selectedAgentId === null}
              onSelect={() => { onSelectAgent(null); onBack(); }}
            />
            <div className="mx-3 my-1 border-t border-border/40" />
            {agents.length > 0 ? (
              agents.map((agent: HermesAgent) => (
                <AgentRow
                  key={agent.id}
                  id={agent.id}
                  name={agent.name ?? agent.id}
                  description={agent.description ?? agent.model}
                  model={agent.description ? agent.model : undefined}
                  isSelected={selectedAgentId === agent.id}
                  onSelect={() => { onSelectAgent(agent.id); onBack(); }}
                />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-center px-6">
                <p className="text-sm text-muted-foreground">
                  {t("hermes.agents.empty", { defaultValue: "暂无可用智能体" })}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Selected indicator at bottom */}
      {selectedAgentId && (
        <div className="px-3 py-2 border-t border-border/50 shrink-0">
          <p className="text-xs text-muted-foreground">
            {t("hermes.agents.active", { defaultValue: "当前：" })}
            <span className="text-primary font-medium ml-1">
              {agents.find((a) => a.id === selectedAgentId)?.name ?? selectedAgentId}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

interface AgentRowProps {
  id: string | null;
  name: string;
  description?: string;
  model?: string;
  isSelected: boolean;
  onSelect: () => void;
}

function AgentRow({ name, description, model, isSelected, onSelect }: AgentRowProps) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-accent/60 transition-colors",
        isSelected && "bg-accent/40",
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug truncate">{name}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
        )}
        {model && (
          <p className="text-[10px] text-muted-foreground/60 mt-0.5 font-mono truncate">{model}</p>
        )}
      </div>
      {isSelected && <Check className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />}
    </button>
  );
}
