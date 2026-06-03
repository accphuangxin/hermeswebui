import { Bot, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useHermesAgents } from "@/hooks/useHermesChat";
import type { HermesAgent } from "@/lib/api/agents";

interface AgentsButtonProps {
  isOnline: boolean;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
}

export function AgentsButton({ isOnline, selectedAgentId, onSelectAgent }: AgentsButtonProps) {
  const { t } = useTranslation();
  const { data: agents, isLoading, isError, refetch } = useHermesAgents(isOnline);

  const isActive = selectedAgentId !== null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-7 w-7",
            isActive && "text-primary",
          )}
          title={t("hermes.agents.button", { defaultValue: "智能体" })}
        >
          <Bot className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="px-3 py-2 border-b">
          <p className="text-sm font-medium">{t("hermes.agents.title", { defaultValue: "选择智能体" })}</p>
        </div>
        <div className="py-1 max-h-72 overflow-y-auto">
          {!isOnline ? (
            <p className="px-3 py-4 text-xs text-center text-muted-foreground">
              {t("hermes.agents.offline", { defaultValue: "服务未连接" })}
            </p>
          ) : isLoading ? (
            <p className="px-3 py-4 text-xs text-center text-muted-foreground animate-pulse">
              {t("common.loading", { defaultValue: "加载中..." })}
            </p>
          ) : isError ? (
            <div className="px-3 py-4 text-center">
              <p className="text-xs text-muted-foreground mb-2">
                {t("hermes.agents.loadError", { defaultValue: "加载失败" })}
              </p>
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => void refetch()}>
                {t("hermes.agents.retry", { defaultValue: "重试" })}
              </Button>
            </div>
          ) : (
            <>
              <AgentItem
                id={null}
                name={t("hermes.agents.default", { defaultValue: "默认" })}
                description={t("hermes.agents.defaultHint", { defaultValue: "由服务端决定" })}
                isSelected={selectedAgentId === null}
                onSelect={() => onSelectAgent(null)}
              />
              {agents && agents.length > 0 ? (
                agents.map((agent: HermesAgent) => (
                  <AgentItem
                    key={agent.id}
                    id={agent.id}
                    name={agent.name ?? agent.id}
                    description={agent.model}
                    isSelected={selectedAgentId === agent.id}
                    onSelect={() => onSelectAgent(agent.id)}
                  />
                ))
              ) : (
                <p className="px-3 py-3 text-xs text-center text-muted-foreground">
                  {t("hermes.agents.empty", { defaultValue: "暂无可用智能体" })}
                </p>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface AgentItemProps {
  id: string | null;
  name: string;
  description?: string;
  isSelected: boolean;
  onSelect: () => void;
}

function AgentItem({ name, description, isSelected, onSelect }: AgentItemProps) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-accent transition-colors",
        isSelected && "bg-accent/60",
      )}
    >
      <div className="flex-1 min-w-0 mt-0.5">
        <p className="text-sm font-medium leading-none truncate">{name}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-1 truncate">{description}</p>
        )}
      </div>
      {isSelected && <Check className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />}
    </button>
  );
}
