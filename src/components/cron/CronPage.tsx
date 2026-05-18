import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Play, Pencil, Trash2, Power, PowerOff, Clock, RefreshCw, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cronApi, type CronJob, type CreateCronJobRequest, type UpdateCronJobRequest } from "@/lib/api/cron";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CronJobFormDialog } from "./CronJobFormDialog";
import { cn } from "@/lib/utils";

const cronKeys = {
  all: ["cron"] as const,
  list: ["cron", "list"] as const,
};

const statusColor: Record<string, string> = {
  ok: "text-green-500",
  running: "text-blue-500",
  failed: "text-destructive",
  scheduled: "text-muted-foreground",
};

const statusLabel: Record<string, string> = {
  ok: "正常",
  running: "运行中",
  failed: "失败",
  scheduled: "等待中",
};

function formatTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function CronPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);

  const { data: jobs = [], isLoading, refetch } = useQuery({
    queryKey: cronKeys.list,
    queryFn: () => cronApi.list(true),
    refetchInterval: 30000,
  });

  const selectedJob = jobs.find((j) => j.id === selectedId) ?? null;

  const createMutation = useMutation({
    mutationFn: (job: CreateCronJobRequest) => cronApi.create(job),
    onSuccess: (newJob) => {
      void queryClient.invalidateQueries({ queryKey: cronKeys.list });
      setFormOpen(false);
      setEditingJob(null);
      if (newJob && "id" in newJob) setSelectedId((newJob as CronJob).id);
      toast.success(t("cron.created", { defaultValue: "任务已创建" }));
    },
    onError: (e) => toast.error(String(e)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, job }: { id: string; job: UpdateCronJobRequest }) =>
      cronApi.update(id, job),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cronKeys.list });
      setFormOpen(false);
      setEditingJob(null);
      toast.success(t("cron.updated", { defaultValue: "任务已更新" }));
    },
    onError: (e) => toast.error(String(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => cronApi.delete(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: cronKeys.list });
      if (selectedId === id) setSelectedId(null);
      toast.success(t("cron.deleted", { defaultValue: "任务已删除" }));
    },
    onError: (e) => toast.error(String(e)),
  });

  const triggerMutation = useMutation({
    mutationFn: (id: string) => cronApi.trigger(id),
    onSuccess: () => toast.success(t("cron.triggered", { defaultValue: "任务已触发执行" })),
    onError: (e) => toast.error(String(e)),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      cronApi.update(id, { enabled }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: cronKeys.list }),
    onError: (e) => toast.error(String(e)),
  });

  const handleSubmit = (data: CreateCronJobRequest) => {
    if (editingJob) {
      updateMutation.mutate({ id: editingJob.id, job: data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openEdit = (job: CronJob) => {
    setEditingJob(job);
    setFormOpen(true);
  };

  return (
    <div className="flex h-full w-full">
      {/* ── Left: job list ── */}
      <div className="w-56 border-r flex flex-col shrink-0 bg-muted/20">
        {/* list header */}
        <div className="flex items-center justify-between px-3 h-10 border-b shrink-0">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t("cron.title", { defaultValue: "定时任务" })}
          </span>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void refetch()}>
              <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => { setEditingJob(null); setFormOpen(true); }}
              title={t("cron.new", { defaultValue: "新建" })}
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* list */}
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="text-xs text-muted-foreground text-center py-8">
              {t("cron.loading", { defaultValue: "加载中..." })}
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <Clock className="w-6 h-6 opacity-30" />
              <span className="text-xs">{t("cron.empty", { defaultValue: "暂无任务" })}</span>
            </div>
          ) : (
            <div className="py-1">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelectedId(job.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50",
                    selectedId === job.id && "bg-muted font-medium",
                    !job.enabled && "opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      job.enabled ? "bg-green-500" : "bg-muted-foreground",
                    )}
                  />
                  <span className="flex-1 truncate">{job.name}</span>
                  {selectedId === job.id && <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── Right: detail / empty state ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedJob ? (
          <JobDetail
            job={selectedJob}
            onEdit={openEdit}
            onDelete={(id) => deleteMutation.mutate(id)}
            onTrigger={(id) => triggerMutation.mutate(id)}
            onToggle={(id, enabled) => toggleMutation.mutate({ id, enabled })}
            isTriggering={triggerMutation.isPending && triggerMutation.variables === selectedJob.id}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Clock className="w-10 h-10 opacity-20" />
            <p className="text-sm">{t("cron.selectHint", { defaultValue: "选择一个任务查看详情" })}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setEditingJob(null); setFormOpen(true); }}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              {t("cron.new", { defaultValue: "新建任务" })}
            </Button>
          </div>
        )}
      </div>

      <CronJobFormDialog
        open={formOpen}
        job={editingJob}
        onClose={() => { setFormOpen(false); setEditingJob(null); }}
        onSubmit={handleSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}

// ── Job Detail Panel ──────────────────────────────────────────────────────────

interface JobDetailProps {
  job: CronJob;
  onEdit: (job: CronJob) => void;
  onDelete: (id: string) => void;
  onTrigger: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  isTriggering: boolean;
}

function JobDetail({ job, onEdit, onDelete, onTrigger, onToggle, isTriggering }: JobDetailProps) {
  const { t } = useTranslation();
  const color = statusColor[job.status ?? ""] ?? "text-muted-foreground";
  const label = statusLabel[job.status ?? ""] ?? job.status ?? "—";

  return (
    <div className="flex flex-col h-full">
      {/* Detail header */}
      <div className="flex items-center justify-between px-5 h-10 border-b shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-sm truncate">{job.name}</span>
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono shrink-0">
            {job.schedule}
          </code>
          <span className={cn("text-xs font-medium shrink-0", color)}>
            {label}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onTrigger(job.id)}
            disabled={isTriggering}
            title={t("cron.trigger", { defaultValue: "立即执行" })}
          >
            <Play className={cn("w-3.5 h-3.5 text-green-500", isTriggering && "animate-pulse")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onToggle(job.id, !job.enabled)}
            title={job.enabled ? t("cron.disable", { defaultValue: "禁用" }) : t("cron.enable", { defaultValue: "启用" })}
          >
            {job.enabled
              ? <Power className="w-3.5 h-3.5 text-primary" />
              : <PowerOff className="w-3.5 h-3.5 text-muted-foreground" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(job)}
            title={t("cron.edit", { defaultValue: "编辑" })}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(job.id)}
            title={t("cron.delete", { defaultValue: "删除" })}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Detail body */}
      <ScrollArea className="flex-1">
        <div className="px-6 py-5 space-y-5">
          {/* Meta row */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <DetailField label={t("cron.lastRun", { defaultValue: "上次执行" })} value={formatTime(job.last_run)} />
            <DetailField label={t("cron.nextRun", { defaultValue: "下次执行" })} value={formatTime(job.next_run)} />
            {job.model && (
              <DetailField label={t("cron.form.model", { defaultValue: "模型" })} value={job.model} />
            )}
            <DetailField
              label={t("cron.form.enabled", { defaultValue: "状态" })}
              value={job.enabled ? t("cron.enable", { defaultValue: "启用" }) : t("cron.disable", { defaultValue: "禁用" })}
            />
          </div>

          {/* Prompt */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("cron.form.prompt", { defaultValue: "Prompt" })}
            </p>
            <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
              {job.prompt}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}
