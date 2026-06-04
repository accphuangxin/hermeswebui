import { useState } from "react";
import { Check, Plus, RefreshCw, Trash2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useHermesAgents, useCreateAgent, useDeleteAgent } from "@/hooks/useHermesChat";
import type { HermesAgent } from "@/lib/api/agents";
import { toast } from "sonner";

interface HermesAgentsPageProps {
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null, port?: number, key?: string) => void;
}

interface AgentItem {
  id: string | null;
  name: string;
  description?: string;
  model?: string;
  port?: number;
  key?: string;
  status?: string;
}

export function HermesAgentsPage({ selectedAgentId, onSelectAgent }: HermesAgentsPageProps) {
  const { t } = useTranslation();
  const { data: agents = [], isLoading, isError, error, refetch, isFetching } = useHermesAgents();
  const [showCreate, setShowCreate] = useState(false);
  const [detailAgent, setDetailAgent] = useState<HermesAgent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentItem | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: AgentItem } | null>(null);
  const deleteMutation = useDeleteAgent();

  const seen = new Set<string>();
  const agentItems: AgentItem[] = agents
    .filter((a: HermesAgent) => {
      if (seen.has(a.name)) return false;
      seen.add(a.name);
      return true;
    })
    .map((a: HermesAgent) => ({
      id: (a.isDefault || a.name === "default") ? null : a.name,
      name: a.name,
      description: a.description,
      model: a.model ?? (a.provider ? `${a.provider}` : undefined),
      port: a.apiServerPort,
      key: a.apiServerKey,
      status: a.status,
    }));

  const sorted = [
    ...agentItems.filter((a) => a.id === null),
    ...agentItems.filter((a) => a.id !== null),
  ];

  const handleCardClick = (item: AgentItem) => {
    onSelectAgent(item.id, item.port, item.key);
    const raw = agents.find((a) => a.name === item.name) ?? null;
    setDetailAgent(raw);
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
      toast.success(`智能体 "${deleteTarget.name}" 已删除`);
      if (detailAgent?.name === deleteTarget.name) setDetailAgent(null);
    } catch (e) {
      toast.error("删除失败", { description: String(e) });
    }
    setDeleteTarget(null);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" onClick={() => setContextMenu(null)}>
      <div className="flex items-center justify-end px-4 pt-2 pb-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden px-4 pb-4 flex flex-col gap-4">
        {/* Cards row — fixed height */}
        <div className="shrink-0">
          {isLoading ? (
            <EmptyState pulse>{t("common.loading", { defaultValue: "加载中..." })}</EmptyState>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center h-40 text-center gap-3">
              <p className="text-sm text-muted-foreground">{t("hermes.agents.loadError", { defaultValue: "加载失败" })}</p>
              {error && <p className="text-xs text-destructive/80 max-w-sm break-all font-mono">{String(error)}</p>}
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void refetch()}>
                {t("hermes.agents.retry", { defaultValue: "重试" })}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
              {sorted.map((item) => (
                <AgentCard
                  key={item.id ?? "__default__"}
                  name={item.name}
                  description={item.description}
                  model={item.model}
                  status={item.status}
                  isSelected={selectedAgentId === item.id}
                  onSelect={() => handleCardClick(item)}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                />
              ))}
              <AddAgentCard onClick={() => setShowCreate(true)} active={showCreate} />
            </div>
          )}
        </div>

        {showCreate && (
          <CreateAgentForm
            onClose={() => setShowCreate(false)}
            onCreated={() => { setShowCreate(false); void refetch(); }}
          />
        )}

        {/* Agent detail panel — fills remaining space */}
        {detailAgent && !showCreate && (
          <div className="flex-1 min-h-0">
            <AgentDetailPanel agent={detailAgent} />
          </div>
        )}
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-popover border rounded-md shadow-md py-1 min-w-[120px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-muted transition-colors"
            onClick={() => { setDeleteTarget(contextMenu.item); setContextMenu(null); }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            删除
          </button>
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-xl border shadow-lg p-6 w-80 space-y-4">
            <p className="text-sm font-semibold">确认删除智能体</p>
            <p className="text-sm text-muted-foreground">
              确定要删除 <span className="font-medium text-foreground">"{deleteTarget.name}"</span> 吗？此操作不可撤销。
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>
                取消
              </Button>
              <Button variant="destructive" size="sm" onClick={() => void handleDeleteConfirm()} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? "删除中..." : "确认删除"}
              </Button>
            </div>
          </div>
        </div>
      )}
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

function AgentCard({ name, description, model, status, isSelected, onSelect, onContextMenu }: {
  name: string; description?: string; model?: string; status?: string; isSelected: boolean; onSelect: () => void; onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const isStopped = status === "stopped";
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
        {isStopped && <span className="shrink-0 w-2 h-2 rounded-full bg-destructive" />}
        <p className="text-sm font-semibold leading-snug truncate">{name}</p>
      </div>
      {description && <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{description}</p>}
      {model && <p className="text-[10px] text-muted-foreground/50 font-mono truncate mt-auto pt-1">{model}</p>}
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
          placeholder={t("hermes.agents.soulPlaceholder", { defaultValue: "系统提示词（可选）" })}
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
      {/* Left 1/4: all meta fields, scrollable */}
      <div className="w-1/4 shrink-0 overflow-y-auto space-y-3">
        {allMetaRows.map((r) => <DetailRow key={r.label} label={r.label} value={r.value} />)}
      </div>
      {/* Right 3/4: soul with scrollbar */}
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
