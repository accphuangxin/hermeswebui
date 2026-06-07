import { useState } from "react";
import { Check, Plus, Trash2, X, Play, Square, RotateCcw, Pencil } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useHermesAgents, useCreateAgent, useDeleteAgent,
  useStartAgent, useStopAgent, useRestartAgent, useUpdateAgent,
} from "@/hooks/useHermesChat";
import type { HermesAgent } from "@/lib/api/agents";
import type { UpdateAgentInput } from "@/lib/api/agents";
import { toast } from "sonner";

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

export function HermesAgentsPage({ selectedAgentId, onSelectAgent }: HermesAgentsPageProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: agents = [], isLoading, isError, error } = useHermesAgents();
  const [showCreate, setShowCreate] = useState(false);
  const [detailAgent, setDetailAgent] = useState<HermesAgent | null>(null);
  const [editAgent, setEditAgent] = useState<HermesAgent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentItem | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: AgentItem } | null>(null);

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
      id: (a.isDefault || a.name === "default") ? "default" : a.name,
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
      toast.success(`${deleteTarget.name} — ${t("hermes.agents.deleteConfirmTitle")}`);
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

  const isStartPending = (item: AgentItem) => startMutation.isPending && startMutation.variables === item.rawId;
  const isStopPending = (item: AgentItem) => stopMutation.isPending && stopMutation.variables === item.rawId;
  const isRestartPending = (item: AgentItem) => restartMutation.isPending && restartMutation.variables === item.rawId;

  return (
    <div className="flex flex-col h-full overflow-hidden" onClick={() => setContextMenu(null)}>
      <div className="flex-1 min-h-0 overflow-hidden px-4 pt-2 pb-4 flex flex-col gap-3">
        <div className="shrink-0">
          {isLoading ? (
            <EmptyState pulse>{t("common.loading", { defaultValue: "加载中..." })}</EmptyState>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center h-40 text-center gap-3">
              <p className="text-sm text-muted-foreground">{t("hermes.agents.loadError", { defaultValue: "加载失败" })}</p>
              {error && <p className="text-xs text-destructive/80 max-w-sm break-all font-mono">{String(error)}</p>}
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void queryClient.invalidateQueries({ queryKey: ["hermesAgents"] })}>
                {t("hermes.agents.retry", { defaultValue: "重试" })}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
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
                  onDelete={(e) => { e.stopPropagation(); setDeleteTarget(item); }}
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
              <AddAgentCard onClick={() => { setShowCreate(true); setEditAgent(null); }} active={showCreate} />
            </div>
          )}
        </div>

        {showCreate && (
          <CreateAgentForm
            onClose={() => setShowCreate(false)}
            onCreated={() => { setShowCreate(false); void queryClient.invalidateQueries({ queryKey: ["hermesAgents"] }); }}
          />
        )}

        {editAgent && !showCreate && (
          <EditAgentForm
            agent={editAgent}
            onClose={() => setEditAgent(null)}
            onSaved={(updated) => {
              setEditAgent(null);
              setDetailAgent(updated);
              void queryClient.invalidateQueries({ queryKey: ["hermesAgents"] });
            }}
          />
        )}

        {detailAgent && !showCreate && !editAgent && (
          <div className="flex-1 min-h-0">
            <AgentDetailPanel agent={detailAgent} />
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
              onClick={() => { void handleStop(contextMenu.item, { stopPropagation: () => {} } as React.MouseEvent); setContextMenu(null); }}
              icon={<Square className="w-3.5 h-3.5" />}
              label={tStop}
            />
          ) : (
            <ContextMenuItem
              onClick={() => { void handleStart(contextMenu.item, { stopPropagation: () => {} } as React.MouseEvent); setContextMenu(null); }}
              icon={<Play className="w-3.5 h-3.5" />}
              label={tStart}
            />
          )}
          <ContextMenuItem
            onClick={() => { void handleRestart(contextMenu.item, { stopPropagation: () => {} } as React.MouseEvent); setContextMenu(null); }}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
            label={tRestart}
          />
          <ContextMenuItem
            onClick={(e) => { handleEdit(contextMenu.item, e); setContextMenu(null); }}
            icon={<Pencil className="w-3.5 h-3.5" />}
            label={tEdit}
          />
          {!contextMenu.item.isDefault && (
            <>
              <div className="border-t my-1" />
              <ContextMenuItem
                onClick={() => { setDeleteTarget(contextMenu.item); setContextMenu(null); }}
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
            <p className="text-sm font-semibold">{t("hermes.agents.deleteConfirmTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {t("hermes.agents.deleteConfirmDesc", { name: deleteTarget.name })}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>
                {t("common.cancel", { defaultValue: "取消" })}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => void handleDeleteConfirm()} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? t("common.deleting", { defaultValue: "删除中..." }) : t("common.confirmDelete", { defaultValue: "确认删除" })}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ContextMenuItem({ onClick, icon, label, destructive }: {
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

function EmptyState({ children, pulse }: { children: React.ReactNode; pulse?: boolean }) {
  return (
    <div className="flex items-center justify-center h-40">
      <p className={cn("text-sm text-muted-foreground", pulse && "animate-pulse")}>{children}</p>
    </div>
  );
}

function AgentCard({
  item, isSelected, onSelect, onContextMenu,
  onStart, onStop, onRestart, onEdit, onDelete,
  isStartPending, isStopPending, isRestartPending,
  tStart, tStop, tRestart, tEdit, tDelete,
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
      {isSelected && <Check className="absolute top-2.5 right-2.5 w-3.5 h-3.5 text-primary" />}
      <div className="flex items-center gap-1.5 pr-5">
        {isRunning && <span className="shrink-0 w-2 h-2 rounded-full bg-green-500" />}
        {isStopped && <span className="shrink-0 w-2 h-2 rounded-full bg-destructive" />}
        <p className="text-sm font-semibold leading-snug truncate">{item.name}</p>
      </div>
      {item.description && <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{item.description}</p>}
      {item.model && <p className="text-[10px] text-muted-foreground/50 font-mono truncate mt-auto pt-1">{item.model}</p>}

      {/* Action buttons — right-aligned */}
      <div className="flex items-center justify-end gap-0.5 pt-1 mt-auto" onClick={(e) => e.stopPropagation()}>
        {isRunning ? (
          <ActionBtn onClick={onStop} label={tStop} disabled={isStopPending}>
            <Square className={cn("w-3 h-3", isStopPending && "animate-pulse")} />
          </ActionBtn>
        ) : (
          <ActionBtn onClick={onStart} label={tStart} disabled={isStartPending}>
            <Play className={cn("w-3 h-3", isStartPending && "animate-pulse")} />
          </ActionBtn>
        )}
        <ActionBtn onClick={onRestart} label={tRestart} disabled={isRestartPending}>
          <RotateCcw className={cn("w-3 h-3", isRestartPending && "animate-spin")} />
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

function ActionBtn({ onClick, label, children, disabled, destructive }: {
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

function AddAgentCard({ onClick, active }: { onClick: () => void; active: boolean }) {
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

function CreateAgentForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const { mutate: createAgent, isPending, error } = useCreateAgent();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [soul, setSoul] = useState("");
  const [apiServerPort, setApiServerPort] = useState("");
  const [apiServerKey, setApiServerKey] = useState("");

  function handleSubmit() {
    if (!name.trim()) return;
    createAgent(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        soul: soul.trim() || undefined,
        clone: true,
        api_server_port: apiServerPort ? Number(apiServerPort) : undefined,
        api_server_key: apiServerKey.trim() || undefined,
      },
      { onSuccess: onCreated },
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{t("hermes.agents.create", { defaultValue: "新建 Agent" })}</p>
        <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1" onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Name *">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-agent" className="h-8 text-xs" autoFocus />
        </Field>
        <Field label={t("common.description", { defaultValue: "描述" })}>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-8 text-xs" />
        </Field>
      </div>

      <Field label="Soul">
        <textarea
          value={soul}
          onChange={(e) => setSoul(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs resize-y min-h-[240px] focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder={t("hermes.agents.soulPlaceholder")}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="API Port">
          <Input value={apiServerPort} onChange={(e) => setApiServerPort(e.target.value)} placeholder="8701" className="h-8 text-xs" />
        </Field>
        <Field label="API Key">
          <Input type="password" value={apiServerKey} onChange={(e) => setApiServerKey(e.target.value)} className="h-8 text-xs" />
        </Field>
      </div>

      {error && <p className="text-xs text-destructive break-all font-mono">{String(error)}</p>}

      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={onClose} disabled={isPending}>
          {t("common.cancel", { defaultValue: "取消" })}
        </Button>
        <Button size="sm" className="flex-1 h-8 text-xs" onClick={handleSubmit} disabled={isPending || !name.trim()}>
          {isPending ? t("common.creating", { defaultValue: "创建中..." }) : t("common.create", { defaultValue: "创建" })}
        </Button>
      </div>
    </div>
  );
}

function EditAgentForm({ agent, onClose, onSaved }: {
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
  const [apiServerPort, setApiServerPort] = useState(agent.apiServerPort ? String(agent.apiServerPort) : "");
  const [apiServerKey, setApiServerKey] = useState(agent.apiServerKey ?? "");

  function handleSubmit() {
    const input: UpdateAgentInput = {};
    if (description !== (agent.description ?? "")) input.description = description.trim() || undefined;
    if (soul !== (agent.soul ?? ""))               input.soul = soul.trim() || undefined;
    if (model !== (agent.model ?? ""))             input.model = model.trim() || undefined;
    if (provider !== (agent.provider ?? ""))       input.provider = provider.trim() || undefined;
    const portNum = apiServerPort ? Number(apiServerPort) : undefined;
    if (portNum !== agent.apiServerPort)           input.api_server_port = portNum;
    if (apiServerKey !== (agent.apiServerKey ?? "")) input.api_server_key = apiServerKey.trim() || undefined;

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
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{t("hermes.agents.editTitle", { name: agent.name })}</p>
        <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1" onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="描述">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-8 text-xs" />
        </Field>
        <Field label="Model">
          <Input value={model} onChange={(e) => setModel(e.target.value)} className="h-8 text-xs" placeholder={agent.model ?? ""} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Provider">
          <Input value={provider} onChange={(e) => setProvider(e.target.value)} className="h-8 text-xs" placeholder={agent.provider ?? ""} />
        </Field>
        <Field label="API Port">
          <Input value={apiServerPort} onChange={(e) => setApiServerPort(e.target.value)} className="h-8 text-xs" placeholder={agent.apiServerPort ? String(agent.apiServerPort) : "8701"} />
        </Field>
      </div>

      <Field label="API Key">
        <Input type="password" value={apiServerKey} onChange={(e) => setApiServerKey(e.target.value)} className="h-8 text-xs" />
      </Field>

      <Field label="Soul">
        <textarea
          value={soul}
          onChange={(e) => setSoul(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs resize-y min-h-[240px] focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="系统提示词"
        />
      </Field>

      {error && <p className="text-xs text-destructive break-all font-mono">{String(error)}</p>}

      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={onClose} disabled={isPending}>
          {t("common.cancel", { defaultValue: "取消" })}
        </Button>
        <Button size="sm" className="flex-1 h-8 text-xs" onClick={handleSubmit} disabled={isPending}>
          {isPending ? t("common.saving", { defaultValue: "保存中..." }) : t("common.save", { defaultValue: "保存" })}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-xs font-mono break-all">{value}</span>
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
        {allMetaRows.map((r) => <DetailRow key={r.label} label={r.label} value={r.value} />)}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1 overflow-hidden">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide shrink-0">Soul</span>
        {agent.soul ? (
          <div className="flex-1 overflow-y-auto bg-muted/40 rounded-md p-3 prose prose-sm dark:prose-invert max-w-none text-xs">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{agent.soul}</ReactMarkdown>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">—</div>
        )}
      </div>
    </div>
  );
}
