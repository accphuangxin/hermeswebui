import { useState } from "react";
import {
  Check,
  Plus,
  Trash2,
  X,
  Play,
  Square,
  RotateCcw,
  Pencil,
  Database,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useHermesAgents,
  useCreateAgent,
  useDeleteAgent,
  useStartAgent,
  useStopAgent,
  useRestartAgent,
  useUpdateAgent,
} from "@/hooks/useHermesChat";
import type { HermesAgent } from "@/lib/api/agents";
import type { UpdateAgentInput } from "@/lib/api/agents";
import { toast } from "sonner";
import { useAgentProviders, useUpsertProvider, useDeleteProvider } from "@/hooks/useAgentProviders";
import type { AgentProvider, AgentProviderModel } from "@/lib/api/agentProviders";

interface HermesAgentsPageProps {
  selectedAgentId: string;
  onSelectAgent: (agentId: string, port?: number, key?: string) => void;
}

interface AgentItem {
  id: string;
  name: string;
  description?: string;
  model?: string;
  port?: number;
  key?: string;
  status?: string;
  isDefault?: boolean;
  rawId: string;
}

export function HermesAgentsPage({
  selectedAgentId,
  onSelectAgent,
}: HermesAgentsPageProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: agents = [], isLoading, isError, error } = useHermesAgents();
  const [showCreate, setShowCreate] = useState(false);
  const [detailAgent, setDetailAgent] = useState<HermesAgent | null>(null);
  const [editAgent, setEditAgent] = useState<HermesAgent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentItem | null>(null);
  const [providerAgent, setProviderAgent] = useState<AgentItem | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: AgentItem;
  } | null>(null);

  const deleteMutation = useDeleteAgent();
  const startMutation = useStartAgent();
  const stopMutation = useStopAgent();
  const restartMutation = useRestartAgent();

  const tStart = t("hermes.agents.start");
  const tStop = t("hermes.agents.stop");
  const tRestart = t("hermes.agents.restart");
  const tEdit = t("hermes.agents.edit");
  const tDelete = t("hermes.agents.delete");

  const seen = new Set<string>();
  const agentItems: AgentItem[] = agents
    .filter((a: HermesAgent) => {
      if (seen.has(a.name)) return false;
      seen.add(a.name);
      return true;
    })
    .map((a: HermesAgent) => ({
      id: a.isDefault || a.name === "default" ? "default" : a.name,
      name: a.name,
      description: a.description,
      model: a.model ?? (a.provider ? `${a.provider}` : undefined),
      port: a.apiServerPort,
      key: a.apiServerKey,
      status: a.status,
      isDefault: a.isDefault || a.name === "default",
      rawId: a.id,
    }));

  const sorted = [
    ...agentItems.filter((a) => a.id === "default"),
    ...agentItems.filter((a) => a.id !== "default"),
  ];

  const handleCardClick = (item: AgentItem) => {
    onSelectAgent(item.id, item.port, item.key);
    const raw = agents.find((a) => a.name === item.name) ?? null;
    setDetailAgent(raw);
    setEditAgent(null);
    setShowCreate(false);
    setContextMenu(null);
  };

  const handleContextMenu = (e: React.MouseEvent, item: AgentItem) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.name);
      toast.success(
        `${deleteTarget.name} — ${t("hermes.agents.deleteConfirmTitle")}`,
      );
      if (detailAgent?.name === deleteTarget.name) setDetailAgent(null);
      if (editAgent?.name === deleteTarget.name) setEditAgent(null);
    } catch (err) {
      toast.error(t("hermes.agents.delete"), { description: String(err) });
    }
    setDeleteTarget(null);
  };

  const handleStart = async (item: AgentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await startMutation.mutateAsync(item.rawId);
      toast.success(`${item.name} — ${t("hermes.agents.startSuccess")}`);
    } catch (err) {
      toast.error(t("hermes.agents.startFail"), { description: String(err) });
    }
  };

  const handleStop = async (item: AgentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await stopMutation.mutateAsync(item.rawId);
      toast.success(`${item.name} — ${t("hermes.agents.stopSuccess")}`);
    } catch (err) {
      toast.error(t("hermes.agents.stopFail"), { description: String(err) });
    }
  };

  const handleRestart = async (item: AgentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await restartMutation.mutateAsync(item.rawId);
      toast.success(`${item.name} — ${t("hermes.agents.restartSuccess")}`);
    } catch (err) {
      toast.error(t("hermes.agents.restartFail"), { description: String(err) });
    }
  };

  const handleEdit = (item: AgentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const raw = agents.find((a) => a.name === item.name) ?? null;
    setEditAgent(raw);
    setDetailAgent(raw);
    setShowCreate(false);
    setContextMenu(null);
  };

  const isStartPending = (item: AgentItem) =>
    startMutation.isPending && startMutation.variables === item.rawId;
  const isStopPending = (item: AgentItem) =>
    stopMutation.isPending && stopMutation.variables === item.rawId;
  const isRestartPending = (item: AgentItem) =>
    restartMutation.isPending && restartMutation.variables === item.rawId;

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      onClick={() => setContextMenu(null)}
    >
      <div className="flex-1 min-h-0 overflow-hidden px-4 pt-2 pb-4 flex flex-col gap-3">
        <div className={`w-full overflow-y-auto overflow-x-hidden ${detailAgent || showCreate || editAgent || providerAgent ? "shrink-0 max-h-[300px]" : "flex-1"}`}>
          {isLoading ? (
            <EmptyState pulse>
              {t("common.loading", { defaultValue: "加载中..." })}
            </EmptyState>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center h-40 text-center gap-3">
              <p className="text-sm text-muted-foreground">
                {t("hermes.agents.loadError", { defaultValue: "加载失败" })}
              </p>
              {error && (
                <p className="text-xs text-destructive/80 max-w-sm break-all font-mono">
                  {String(error)}
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  void queryClient.invalidateQueries({
                    queryKey: ["hermesAgents"],
                  })
                }
              >
                {t("hermes.agents.retry", { defaultValue: "重试" })}
              </Button>
            </div>
          ) : (
            <div className="w-full grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
              {sorted.map((item) => (
                <AgentCard
                  key={item.id ?? "__default__"}
                  item={item}
                  isSelected={selectedAgentId === item.id}
                  onSelect={() => handleCardClick(item)}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                  onStart={(e) => void handleStart(item, e)}
                  onStop={(e) => void handleStop(item, e)}
                  onRestart={(e) => void handleRestart(item, e)}
                  onEdit={(e) => handleEdit(item, e)}
                  onDelete={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(item);
                  }}
                  onManageProviders={(e) => {
                    e.stopPropagation();
                    setProviderAgent(item);
                    setDetailAgent(null);
                    setEditAgent(null);
                    setShowCreate(false);
                    setContextMenu(null);
                  }}
                  isStartPending={isStartPending(item)}
                  isStopPending={isStopPending(item)}
                  isRestartPending={isRestartPending(item)}
                  tStart={tStart}
                  tStop={tStop}
                  tRestart={tRestart}
                  tEdit={tEdit}
                  tDelete={tDelete}
                />
              ))}
              <AddAgentCard
                onClick={() => {
                  setShowCreate(true);
                  setEditAgent(null);
                }}
                active={showCreate}
              />
            </div>
          )}
        </div>

        {showCreate && (
          <CreateAgentForm
            onClose={() => setShowCreate(false)}
            onCreated={() => {
              setShowCreate(false);
              void queryClient.invalidateQueries({
                queryKey: ["hermesAgents"],
              });
            }}
          />
        )}

        {editAgent && !showCreate && (
          <EditAgentForm
            agent={editAgent}
            onClose={() => setEditAgent(null)}
            onSaved={(updated) => {
              setEditAgent(null);
              setDetailAgent(updated);
              void queryClient.invalidateQueries({
                queryKey: ["hermesAgents"],
              });
            }}
          />
        )}

        {detailAgent && !showCreate && !editAgent && !providerAgent && (
          <div className="flex-1 min-h-0">
            <AgentDetailPanel agent={detailAgent} />
          </div>
        )}

        {providerAgent && !showCreate && !editAgent && (
          <div className="flex-1 min-h-0">
            <ProviderManagerPanel
              agent={providerAgent}
              onClose={() => setProviderAgent(null)}
            />
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 bg-popover border rounded-md shadow-md py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.item.status === "running" ? (
            <ContextMenuItem
              onClick={() => {
                void handleStop(contextMenu.item, {
                  stopPropagation: () => {},
                } as React.MouseEvent);
                setContextMenu(null);
              }}
              icon={<Square className="w-3.5 h-3.5" />}
              label={tStop}
            />
          ) : (
            <ContextMenuItem
              onClick={() => {
                void handleStart(contextMenu.item, {
                  stopPropagation: () => {},
                } as React.MouseEvent);
                setContextMenu(null);
              }}
              icon={<Play className="w-3.5 h-3.5" />}
              label={tStart}
            />
          )}
          <ContextMenuItem
            onClick={() => {
              void handleRestart(contextMenu.item, {
                stopPropagation: () => {},
              } as React.MouseEvent);
              setContextMenu(null);
            }}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
            label={tRestart}
          />
          <ContextMenuItem
            onClick={(e) => {
              handleEdit(contextMenu.item, e);
              setContextMenu(null);
            }}
            icon={<Pencil className="w-3.5 h-3.5" />}
            label={tEdit}
          />
          {!contextMenu.item.isDefault && (
            <>
              <div className="border-t my-1" />
              <ContextMenuItem
                onClick={() => {
                  setDeleteTarget(contextMenu.item);
                  setContextMenu(null);
                }}
                icon={<Trash2 className="w-3.5 h-3.5" />}
                label={tDelete}
                destructive
              />
            </>
          )}
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-xl border shadow-lg p-6 w-80 space-y-4">
            <p className="text-sm font-semibold">
              {t("hermes.agents.deleteConfirmTitle")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("hermes.agents.deleteConfirmDesc", {
                name: deleteTarget.name,
              })}
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
              >
                {t("common.cancel", { defaultValue: "取消" })}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void handleDeleteConfirm()}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending
                  ? t("common.deleting", { defaultValue: "删除中..." })
                  : t("common.confirmDelete", { defaultValue: "确认删除" })}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ContextMenuItem({
  onClick,
  icon,
  label,
  destructive,
}: {
  onClick: (e: React.MouseEvent) => void;
  icon: React.ReactNode;
  label: string;
  destructive?: boolean;
}) {
  return (
    <button
      className={cn(
        "w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors",
        destructive && "text-destructive",
      )}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyState({
  children,
  pulse,
}: {
  children: React.ReactNode;
  pulse?: boolean;
}) {
  return (
    <div className="flex items-center justify-center h-40">
      <p
        className={cn(
          "text-sm text-muted-foreground",
          pulse && "animate-pulse",
        )}
      >
        {children}
      </p>
    </div>
  );
}

function AgentCard({
  item,
  isSelected,
  onSelect,
  onContextMenu,
  onStart,
  onStop,
  onRestart,
  onEdit,
  onDelete,
  onManageProviders,
  isStartPending,
  isStopPending,
  isRestartPending,
  tStart,
  tStop,
  tRestart,
  tEdit,
  tDelete,
}: {
  item: AgentItem;
  isSelected: boolean;
  onSelect: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onStart: (e: React.MouseEvent) => void;
  onStop: (e: React.MouseEvent) => void;
  onRestart: (e: React.MouseEvent) => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onManageProviders: (e: React.MouseEvent) => void;
  isStartPending: boolean;
  isStopPending: boolean;
  isRestartPending: boolean;
  tStart: string;
  tStop: string;
  tRestart: string;
  tEdit: string;
  tDelete: string;
}) {
  const isRunning = item.status === "running";
  const isStopped = item.status === "stopped";

  return (
    <button
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={cn(
        "relative flex flex-col gap-1.5 p-3 rounded-xl border text-left transition-all",
        "hover:border-primary/50 hover:bg-accent/40",
        isSelected ? "border-primary bg-primary/5" : "border-border bg-card",
      )}
    >
      {isSelected && (
        <Check className="absolute top-2.5 right-2.5 w-3.5 h-3.5 text-primary" />
      )}
      <div className="flex items-center gap-1.5 pr-5">
        {isRunning && (
          <span className="shrink-0 w-2 h-2 rounded-full bg-green-500" />
        )}
        {isStopped && (
          <span className="shrink-0 w-2 h-2 rounded-full bg-destructive" />
        )}
        <p className="text-sm font-semibold leading-snug truncate">
          {item.name}
        </p>
      </div>
      {item.description && (
        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
          {item.description}
        </p>
      )}
      {/* Model tag — clickable if provider management is available */}
      <div
        className="mt-auto pt-1"
        onClick={(e) => e.stopPropagation()}
      >
        {item.model && item.port && item.key ? (
          <button
            type="button"
            onClick={item.status === "running" ? onManageProviders : undefined}
            title={item.status === "running" ? "管理模型" : "启动后可管理模型"}
            className={cn(
              "flex items-center gap-1 text-[10px] font-mono rounded px-1.5 py-0.5 transition-colors",
              item.status === "running"
                ? "text-primary/70 hover:text-primary hover:bg-primary/10 cursor-pointer"
                : "text-muted-foreground/40 cursor-default",
            )}
          >
            <Database className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">{item.model}</span>
          </button>
        ) : item.model ? (
          <p className="text-[10px] text-muted-foreground/50 font-mono truncate px-1.5">
            {item.model}
          </p>
        ) : null}
      </div>

      {/* Action buttons — right-aligned */}
      <div
        className="flex items-center justify-end gap-0.5 pt-1"
        onClick={(e) => e.stopPropagation()}
      >
        {isRunning ? (
          <ActionBtn onClick={onStop} label={tStop} disabled={isStopPending}>
            <Square
              className={cn("w-3 h-3", isStopPending && "animate-pulse")}
            />
          </ActionBtn>
        ) : (
          <ActionBtn onClick={onStart} label={tStart} disabled={isStartPending}>
            <Play
              className={cn("w-3 h-3", isStartPending && "animate-pulse")}
            />
          </ActionBtn>
        )}
        <ActionBtn
          onClick={onRestart}
          label={tRestart}
          disabled={isRestartPending}
        >
          <RotateCcw
            className={cn("w-3 h-3", isRestartPending && "animate-spin")}
          />
        </ActionBtn>
        <ActionBtn onClick={onEdit} label={tEdit}>
          <Pencil className="w-3 h-3" />
        </ActionBtn>
        {!item.isDefault && (
          <ActionBtn onClick={onDelete} label={tDelete} destructive>
            <Trash2 className="w-3 h-3" />
          </ActionBtn>
        )}
      </div>
    </button>
  );
}

function ActionBtn({
  onClick,
  label,
  children,
  disabled,
  destructive,
}: {
  onClick: (e: React.MouseEvent) => void;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      disabled={disabled}
      className={cn(
        "flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-muted transition-colors disabled:opacity-40 text-muted-foreground",
        destructive && "hover:text-destructive",
      )}
    >
      {children}
      <span className="text-[10px]">{label}</span>
    </button>
  );
}

function AddAgentCard({
  onClick,
  active,
}: {
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border transition-all",
        "border-dashed",
        active
          ? "border-primary/50 bg-accent/40"
          : "border-border hover:border-primary/50 hover:bg-accent/40",
      )}
    >
      <Plus className="w-5 h-5 text-muted-foreground" />
    </button>
  );
}

function CreateAgentForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const { mutate: createAgent, isPending, error } = useCreateAgent();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [soul, setSoul] = useState("");
  const [apiServerPort, setApiServerPort] = useState("");
  const [apiServerKey, setApiServerKey] = useState("");

  function handleSubmit() {
    if (!name.trim() || !apiServerKey.trim()) return;
    createAgent(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        soul: soul.trim() || undefined,
        clone: true,
        api_server_port: apiServerPort ? Number(apiServerPort) : undefined,
        api_server_key: apiServerKey.trim(),
      },
      { onSuccess: onCreated },
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col h-[600px]">
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <p className="text-sm font-semibold">
          {t("hermes.agents.create", { defaultValue: "新建 Agent" })}
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 -mr-1"
          onClick={onClose}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-[1fr_3fr] gap-4 p-4 flex-1 min-h-0">
        {/* 左侧：其他属性 (1/4) */}
        <div className="space-y-4">
          <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              NAME *
            </div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-agent"
              className="h-9 text-sm"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              DESCRIPTION
            </div>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("common.description", { defaultValue: "描述" })}
              className="h-9 text-sm"
            />
          </div>

          <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              API PORT
            </div>
            <Input
              value={apiServerPort}
              onChange={(e) => setApiServerPort(e.target.value)}
              placeholder="8701"
              className="h-9 text-sm"
            />
          </div>

          <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              API KEY <span className="text-destructive">*</span>
            </div>
            <Input
              value={apiServerKey}
              onChange={(e) => setApiServerKey(e.target.value)}
              placeholder="my-secret-key"
              className="h-9 text-sm"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive break-all font-mono col-span-2">
              {String(error)}
            </p>
          )}
        </div>

        {/* 右侧：SOUL (3/4) */}
        <div className="flex flex-col min-h-0">
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2 shrink-0">
            SOUL
          </div>
          <textarea
            value={soul}
            onChange={(e) => setSoul(e.target.value)}
            className="flex-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={t("hermes.agents.soulPlaceholder")}
          />
        </div>
      </div>

      <div className="flex gap-2 px-4 py-3 border-t bg-muted/30 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-9"
          onClick={onClose}
          disabled={isPending}
        >
          {t("common.cancel", { defaultValue: "取消" })}
        </Button>
        <Button
          size="sm"
          className="flex-1 h-9"
          onClick={handleSubmit}
          disabled={isPending || !name.trim() || !apiServerKey.trim()}
        >
          {isPending
            ? t("common.creating", { defaultValue: "创建中..." })
            : t("common.create", { defaultValue: "创建" })}
        </Button>
      </div>
    </div>
  );
}

function EditAgentForm({
  agent,
  onClose,
  onSaved,
}: {
  agent: HermesAgent;
  onClose: () => void;
  onSaved: (updated: HermesAgent) => void;
}) {
  const { t } = useTranslation();
  const { mutate: updateAgent, isPending, error } = useUpdateAgent();
  const [description, setDescription] = useState(agent.description ?? "");
  const [soul, setSoul] = useState(agent.soul ?? "");
  const [model, setModel] = useState(agent.model ?? "");
  const [provider, setProvider] = useState(agent.provider ?? "");
  const [apiServerPort, setApiServerPort] = useState(
    agent.apiServerPort ? String(agent.apiServerPort) : "",
  );
  const [apiServerKey, setApiServerKey] = useState(agent.apiServerKey ?? "");
  const [baseUrl, setBaseUrl] = useState(agent.baseUrl ?? "");

  // Model select mode: "select" when agent has port+key, else "manual"
  const hasServer = !!(agent.apiServerPort && agent.apiServerKey);
  const [modelMode, setModelMode] = useState<"select" | "manual">(hasServer ? "select" : "manual");
  const { data: providers = [] } = useAgentProviders(
    modelMode === "select" ? agent.apiServerPort : undefined,
    modelMode === "select" ? agent.apiServerKey : undefined,
  );
  // Flatten all provider models into selectable options
  const modelOptions = providers.flatMap((p) =>
    Object.keys(p.models ?? {}).map((m) => ({ provider: p.name, model: m, baseUrl: p.base_url }))
  );
  // If provider has no models key but has a default model, add it
  providers.forEach((p) => {
    if (!p.models || Object.keys(p.models).length === 0) {
      modelOptions.push({ provider: p.name, model: p.model, baseUrl: p.base_url });
    }
  });

  function handleSubmit() {
    const input: UpdateAgentInput = {};
    if (description !== (agent.description ?? ""))
      input.description = description.trim() || undefined;
    if (soul !== (agent.soul ?? "")) input.soul = soul.trim() || undefined;
    if (model !== (agent.model ?? "")) input.model = model.trim() || undefined;
    if (provider !== (agent.provider ?? ""))
      input.provider = provider.trim() || undefined;
    if (baseUrl !== (agent.baseUrl ?? ""))
      input.base_url = baseUrl.trim() || undefined;
    const portNum = apiServerPort ? Number(apiServerPort) : undefined;
    if (portNum !== agent.apiServerPort) input.api_server_port = portNum;
    if (apiServerKey !== (agent.apiServerKey ?? ""))
      input.api_server_key = apiServerKey.trim() || undefined;

    updateAgent(
      { agentId: agent.id, input },
      {
        onSuccess: (updated) => {
          toast.success(`${agent.name} — ${t("hermes.agents.updateSuccess")}`);
          onSaved(updated);
        },
      },
    );
  }

  return (
    <div className="flex gap-4 h-[600px]">
      {/* Left panel: agent settings */}
      <div className="flex-1 rounded-xl border border-border bg-card overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <p className="text-sm font-semibold">
            {t("hermes.agents.editTitle", { name: agent.name })}
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">DESCRIPTION</div>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={agent.description ?? "描述"} className="h-9 text-sm" />
          </div>

          {/* Default Model */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">DEFAULT MODEL</div>
              {hasServer && (
                <button type="button" className="text-[10px] text-primary hover:opacity-80"
                  onClick={() => setModelMode((m) => m === "select" ? "manual" : "select")}>
                  {modelMode === "select" ? "手动填写" : "从列表选择"}
                </button>
              )}
            </div>
            {modelMode === "select" ? (
              <div className="border rounded-md overflow-hidden">
                {providers.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2 animate-pulse">加载中...</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto">
                    {modelOptions.map((opt, i) => {
                      const isSelected = opt.model === model && opt.provider === provider;
                      return (
                        <button key={i} type="button"
                          className={cn("w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-muted/60 transition-colors", isSelected && "bg-primary/10 text-primary")}
                          onClick={() => { setModel(opt.model); setProvider(opt.provider); setBaseUrl(opt.baseUrl ?? ""); }}>
                          <span className="font-mono font-medium truncate">{opt.model}</span>
                          <span className="text-muted-foreground/60 shrink-0">{opt.provider}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {model && (
                  <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground bg-muted/20 space-y-1">
                    <div className="flex gap-2">
                      <span>已选：</span>
                      <span className="font-mono font-medium text-foreground">{model}</span>
                      {provider && <span className="text-muted-foreground/60">({provider})</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 uppercase tracking-wide">Base URL</span>
                      <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder="可选，留空使用 provider 默认值"
                        className="flex-1 bg-background border border-input rounded px-2 py-0.5 text-[10px] font-mono outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[80px_1fr] gap-3 items-center">
                  <div className="text-xs text-muted-foreground">MODEL</div>
                  <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={agent.model ?? "qwen3_6"} className="h-8 text-sm" />
                </div>
                <div className="grid grid-cols-[80px_1fr] gap-3 items-center">
                  <div className="text-xs text-muted-foreground">PROVIDER</div>
                  <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder={agent.provider ?? "custom"} className="h-8 text-sm" />
                </div>
                <div className="grid grid-cols-[80px_1fr] gap-3 items-center">
                  <div className="text-xs text-muted-foreground">BASE URL</div>
                  <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="可选" className="h-8 text-sm" />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">API PORT</div>
            <Input value={apiServerPort} onChange={(e) => setApiServerPort(e.target.value)} placeholder={agent.apiServerPort ? String(agent.apiServerPort) : "8701"} className="h-9 text-sm" />
          </div>

          <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">API KEY</div>
            <Input value={apiServerKey} onChange={(e) => setApiServerKey(e.target.value)} placeholder="my-secret-key" className="h-9 text-sm" />
          </div>

          {error && <p className="text-xs text-destructive break-all font-mono">{String(error)}</p>}
        </div>

        <div className="px-4 py-3 border-t bg-muted/30 shrink-0">
          <Button variant="outline" size="sm" className="w-full h-9" onClick={onClose} disabled={isPending}>
            {t("common.cancel", { defaultValue: "取消" })}
          </Button>
        </div>
      </div>

      {/* Right panel: Soul */}
      <div className="flex-1 rounded-xl border border-border bg-card overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">SOUL</p>
          <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        <textarea
          value={soul}
          onChange={(e) => setSoul(e.target.value)}
          className="flex-1 w-full bg-background px-4 py-3 text-sm resize-none focus:outline-none"
          placeholder="系统提示词"
        />

        <div className="px-4 py-3 border-t bg-muted/30 shrink-0">
          <Button size="sm" className="w-full h-9" onClick={handleSubmit} disabled={isPending}>
            {isPending ? t("common.saving", { defaultValue: "保存中..." }) : t("common.save", { defaultValue: "保存" })}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span className="text-xs font-mono break-all">{value}</span>
    </div>
  );
}

function ProviderManagerPanel({
  agent,
  onClose,
}: {
  agent: AgentItem;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const port = agent.port;
  const key = agent.key;
  const { data: providers = [], isLoading, error, refetch } = useAgentProviders(port, key);
  const upsertMutation = useUpsertProvider(port, key);
  const deleteMutation = useDeleteProvider(port, key);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [formModel, setFormModel] = useState("");
  // models rows: array of {id, context_length, supports_vision}
  const [modelRows, setModelRows] = useState<{ id: string; context_length: string; supports_vision: boolean }[]>([
    { id: "", context_length: "100000", supports_vision: false },
  ]);

  const resetForm = () => {
    setFormName(""); setFormBaseUrl(""); setFormApiKey(""); setFormModel("");
    setModelRows([{ id: "", context_length: "100000", supports_vision: false }]);
  };

  const loadProvider = (p: AgentProvider) => {
    setFormName(p.name);
    setFormBaseUrl(p.base_url);
    setFormApiKey(p.api_key);
    setFormModel(p.model);
    const rows = Object.entries(p.models).map(([id, m]) => ({
      id,
      context_length: String(m.context_length),
      supports_vision: m.supports_vision,
    }));
    setModelRows(rows.length > 0 ? rows : [{ id: "", context_length: "100000", supports_vision: false }]);
  };

  const handleSubmit = () => {
    if (!formName.trim() || !formBaseUrl.trim() || !formApiKey.trim() || !formModel.trim()) return;
    const models: Record<string, AgentProviderModel> = {};
    for (const row of modelRows) {
      if (row.id.trim()) {
        models[row.id.trim()] = {
          context_length: Number(row.context_length) || 100000,
          supports_vision: row.supports_vision,
        };
      }
    }
    upsertMutation.mutate(
      { name: formName.trim(), base_url: formBaseUrl.trim(), api_key: formApiKey.trim(), model: formModel.trim(), models },
      {
        onSuccess: () => { toast.success(`Provider "${formName}" 已保存`); resetForm(); },
        onError: (e) => toast.error("保存失败", { description: String(e) }),
      },
    );
  };

  const handleDelete = (name: string) => setDeleteTarget(name);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget, {
      onSuccess: () => { toast.success(`Provider "${deleteTarget}" 已删除`); setDeleteTarget(null); },
      onError: (e) => { toast.error("删除失败", { description: String(e) }); setDeleteTarget(null); },
    });
  };

  return (
    <div className="relative h-full rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">模型管理 — {agent.name}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1" onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Delete confirm dialog */}
      {deleteTarget && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 rounded-xl">
          <div className="bg-card rounded-xl border shadow-lg p-6 w-72 space-y-4">
            <p className="text-sm font-semibold">确认删除</p>
            <p className="text-sm text-muted-foreground">
              确定要删除 Provider <span className="font-mono font-medium text-foreground">"{deleteTarget}"</span> 吗？此操作不可撤销。
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>
                取消
              </Button>
              <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? "删除中..." : "确认删除"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Left-right layout: provider list | form */}
      <div className="flex-1 min-h-0 flex gap-4 p-4 overflow-hidden">
        {/* Left: Provider list */}
        <div className="w-2/5 rounded-lg border bg-muted/20 overflow-y-auto p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Provider 列表</span>
            <button
              className="text-[10px] text-primary hover:opacity-80"
              onClick={resetForm}
            >
              + 新建
            </button>
          </div>
          {isLoading ? (
            <p className="text-xs text-muted-foreground animate-pulse">加载中...</p>
          ) : error ? (
            <div className="flex items-center gap-2">
              <p className="text-xs text-destructive">{String(error)}</p>
              <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => void refetch()}>重试</Button>
            </div>
          ) : providers.length === 0 ? (
            <p className="text-xs text-muted-foreground">暂无 Provider，点击右侧填写表单添加</p>
          ) : (
            <div className="space-y-1">
              {providers.map((p) => (
                <div
                  key={p.name}
                  className={`flex items-center justify-between rounded px-2 py-1.5 cursor-pointer transition-colors ${formName === p.name ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50"}`}
                  onClick={() => loadProvider(p)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold font-mono truncate">{p.name}</span>
                      <span className="text-[10px] text-muted-foreground/60 font-mono truncate">{p.model}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{p.base_url}</p>
                  </div>
                  <button
                    className="shrink-0 ml-1.5 px-1 py-0.5 rounded text-[10px] hover:bg-destructive/10 transition-colors text-destructive"
                    onClick={(e) => { e.stopPropagation(); handleDelete(p.name); }}
                    disabled={deleteMutation.isPending}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Form */}
        <div className="flex-1 rounded-lg border bg-muted/20 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {formName ? `编辑 — ${formName}` : "新建 Provider"}
          </span>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">名称 *</label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="CloudCI" className="h-7 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">默认模型 *</label>
              <Input value={formModel} onChange={(e) => setFormModel(e.target.value)} placeholder="qwen3_6" className="h-7 text-xs" />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Base URL *</label>
              <Input value={formBaseUrl} onChange={(e) => setFormBaseUrl(e.target.value)} placeholder="http://token.cloudci.com/v1" className="h-7 text-xs" />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">API Key *</label>
              <Input value={formApiKey} onChange={(e) => setFormApiKey(e.target.value)} placeholder="sk-xxx" className="h-7 text-xs" />
            </div>
          </div>

          {/* Model rows */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">模型列表</label>
              <button
                className="text-[10px] text-primary hover:opacity-80"
                onClick={() => setModelRows((r) => [...r, { id: "", context_length: "100000", supports_vision: false }])}
              >
                + 添加模型
              </button>
            </div>
            <div className="space-y-1.5">
              {modelRows.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={row.id}
                    onChange={(e) => setModelRows((rows) => rows.map((r, i) => i === idx ? { ...r, id: e.target.value } : r))}
                    placeholder="model_id"
                    className="h-7 text-xs flex-1"
                  />
                  <Input
                    value={row.context_length}
                    onChange={(e) => setModelRows((rows) => rows.map((r, i) => i === idx ? { ...r, context_length: e.target.value } : r))}
                    placeholder="100000"
                    className="h-7 text-xs w-24"
                  />
                  <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
                    <input
                      type="checkbox"
                      checked={row.supports_vision}
                      onChange={(e) => setModelRows((rows) => rows.map((r, i) => i === idx ? { ...r, supports_vision: e.target.checked } : r))}
                    />
                    视觉
                  </label>
                  {modelRows.length > 1 && (
                    <button
                      className="text-destructive/60 hover:text-destructive text-xs"
                      onClick={() => setModelRows((rows) => rows.filter((_, i) => i !== idx))}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
          <div className="flex justify-end gap-2 px-3 py-2.5 border-t shrink-0">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={resetForm}>
              {t("common.cancel", { defaultValue: "清空" })}
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSubmit}
              disabled={upsertMutation.isPending || !formName.trim() || !formBaseUrl.trim() || !formApiKey.trim() || !formModel.trim()}
            >
              {upsertMutation.isPending ? "保存中..." : t("common.save", { defaultValue: "保存" })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentDetailPanel({ agent }: { agent: HermesAgent }) {
  const toStr = (v: string | number | boolean | undefined | null) =>
    v !== undefined && v !== null && v !== "" ? String(v) : null;

  const leftRows = [
    { label: "ID", value: toStr(agent.id) },
    { label: "Status", value: toStr(agent.status) },
    { label: "Provider", value: toStr(agent.provider) },
    { label: "API Port", value: toStr(agent.apiServerPort) },
    { label: "Actual Port", value: toStr(agent.actualPort) },
    { label: "Host", value: toStr(agent.host) },
    { label: "Gateway Running", value: toStr(agent.gatewayRunning) },
    { label: "Source", value: toStr(agent.source) },
  ].filter((r): r is { label: string; value: string } => r.value !== null);

  const rightRows = [
    { label: "Name", value: toStr(agent.name) },
    { label: "Model", value: toStr(agent.model) },
    { label: "Description", value: toStr(agent.description) },
    { label: "API Key", value: agent.apiServerKey ?? null },
    { label: "Skill Count", value: toStr(agent.skillCount) },
    { label: "Is Default", value: toStr(agent.isDefault) },
  ].filter((r): r is { label: string; value: string } => r.value !== null);

  const allMetaRows = [...leftRows, ...rightRows];

  return (
    <div className="h-full rounded-xl border border-border bg-card p-4 flex gap-4 overflow-hidden">
      <div className="w-1/4 shrink-0 overflow-y-auto space-y-3">
        {allMetaRows.map((r) => (
          <DetailRow key={r.label} label={r.label} value={r.value} />
        ))}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1 overflow-hidden">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide shrink-0">
          Soul
        </span>
        {agent.soul ? (
          <div className="flex-1 overflow-y-auto bg-muted/40 rounded-md p-3 prose prose-sm dark:prose-invert max-w-none text-xs">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {agent.soul}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
            —
          </div>
        )}
      </div>
    </div>
  );
}
