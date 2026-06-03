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

  const allItems: Array<{ id: string | null; name: string; description?: string; model?: string }> = [
    {
      id: null,
      name: t("hermes.agents.default", { defaultValue: "默认" }),
      description: t("hermes.agents.defaultHint", { defaultValue: "由服务端决定" }),
    },
    ...agents.map((a: HermesAgent) => ({
      id: a.id,
      name: a.name ?? a.id,
      description: a.description,
      model: a.model,
    })),
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b shrink-0">
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
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {!isOnline ? (
          <EmptyState>{t("hermes.agents.offline", { defaultValue: "服务未连接" })}</EmptyState>
        ) : isLoading ? (
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
                onSelect={() => { onSelectAgent(item.id); onBack(); }}
              />
            ))}
          </div>
        )}
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
