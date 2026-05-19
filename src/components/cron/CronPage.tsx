import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Play, Pencil, Trash2, Power, PowerOff, Clock, RefreshCw, FileText, ChevronLeft } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { cronApi, type CronJob, type CreateCronJobRequest, type UpdateCronJobRequest } from "@/lib/api/cron";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CronJobForm } from "./CronJobForm";
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
  // "detail" | "edit" | "new"
  const [rightMode, setRightMode] = useState<"detail" | "edit" | "new">("detail");

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
      if (newJob && "id" in newJob) setSelectedId((newJob as CronJob).id);
      setRightMode("detail");
      toast.success(t("cron.created", { defaultValue: "任务已创建" }));
    },
    onError: (e) => toast.error(String(e)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, job }: { id: string; job: UpdateCronJobRequest }) =>
      cronApi.update(id, job),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cronKeys.list });
      setRightMode("detail");
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

  const handleFormSubmit = (data: CreateCronJobRequest) => {
    if (rightMode === "edit" && selectedJob) {
      updateMutation.mutate({ id: selectedJob.id, job: data });
    } else {
      createMutation.mutate(data);
    }
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
              onClick={() => { setSelectedId(null); setRightMode("new"); }}
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
            <div className="px-2 pb-2 space-y-0.5">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => { setSelectedId(job.id); setRightMode("detail"); }}
                  className={cn(
                    "group w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left hover:bg-muted transition-colors",
                    selectedId === job.id && "bg-muted font-medium",
                    !job.enabled && "opacity-50",
                  )}
                >
                  <Clock className={cn(
                    "w-3.5 h-3.5 flex-shrink-0",
                    job.enabled ? "text-primary" : "text-muted-foreground",
                  )} />
                  <span className="flex-1 truncate">{job.name}</span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── Right ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {rightMode === "new" ? (
          <CronJobForm
            job={null}
            onCancel={() => setRightMode("detail")}
            onSubmit={handleFormSubmit}
            isPending={createMutation.isPending}
          />
        ) : rightMode === "edit" && selectedJob ? (
          <CronJobForm
            job={selectedJob}
            onCancel={() => setRightMode("detail")}
            onSubmit={handleFormSubmit}
            isPending={updateMutation.isPending}
          />
        ) : selectedJob ? (
          <JobDetail
            job={selectedJob}
            onEdit={() => setRightMode("edit")}
            onDelete={(id) => deleteMutation.mutate(id)}
            onTrigger={(id) => triggerMutation.mutate(id)}
            onToggle={(id, enabled) => toggleMutation.mutate({ id, enabled })}
            isTriggering={triggerMutation.isPending && triggerMutation.variables === selectedJob.id}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Clock className="w-10 h-10 opacity-20" />
            <p className="text-sm">{t("cron.selectHint", { defaultValue: "选择一个任务查看详情" })}</p>
            <Button variant="outline" size="sm" onClick={() => setRightMode("new")}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              {t("cron.new", { defaultValue: "新建任务" })}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Job Detail Panel ──────────────────────────────────────────────────────────

interface JobDetailProps {
  job: CronJob;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onTrigger: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  isTriggering: boolean;
}

interface CronOutputEntry {
  filename: string;
  size: number;
}

function JobDetail({ job, onEdit, onDelete, onTrigger, onToggle, isTriggering }: JobDetailProps) {
  const { t } = useTranslation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedLog, setSelectedLog] = useState<string | null>(null);
  const color = statusColor[job.status ?? ""] ?? "text-muted-foreground";
  const label = statusLabel[job.status ?? ""] ?? job.status ?? "—";

  const { data: logs = [], refetch: refetchLogs, isFetching: isRefetchingLogs } = useQuery<CronOutputEntry[]>({
    queryKey: ["cron_outputs", job.id],
    queryFn: () => invoke("list_cron_outputs", { jobId: job.id }),
    refetchInterval: 30000,
  });

  const { data: logContent } = useQuery<string>({
    queryKey: ["cron_output_content", job.id, selectedLog],
    queryFn: () => invoke("read_cron_output", { jobId: job.id, filename: selectedLog }),
    enabled: !!selectedLog,
  });

  const formatLogName = (filename: string) => filename.replace(".md", "").replace(/_/g, " ");

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
            onClick={() => onEdit()}
            title={t("cron.edit", { defaultValue: "编辑" })}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
            title={t("cron.delete", { defaultValue: "删除" })}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Detail body */}
      <div className="flex-1 flex flex-col min-h-0 px-6 py-5 gap-4 overflow-hidden">
        {/* Meta row */}
        <div className="flex flex-wrap gap-x-8 gap-y-3 shrink-0">
          <DetailField label={t("cron.lastRun", { defaultValue: "上次执行" })} value={formatTime(job.last_run)} />
          <DetailField label={t("cron.nextRun", { defaultValue: "下次执行" })} value={formatTime(job.next_run)} />
          {job.model && (
            <DetailField label={t("cron.form.model", { defaultValue: "模型" })} value={job.model} />
          )}
          <DetailField
            label={t("cron.form.enabled", { defaultValue: "状态" })}
            value={job.enabled ? "✓ 启用" : "✗ 禁用"}
          />
        </div>

        {/* Prompt — fixed small height */}
        <div className="flex flex-col shrink-0 gap-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t("cron.form.prompt", { defaultValue: "Prompt" })}
          </p>
          <div className="h-24 rounded-lg bg-muted/30 border px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap overflow-auto">
            {job.prompt}
          </div>
        </div>

        {/* Execution logs */}
        <div className="flex flex-col flex-1 min-h-0 gap-1.5">
          <div className="flex items-center gap-2 shrink-0">
            {selectedLog && (
              <button
                onClick={() => setSelectedLog(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {selectedLog
                ? formatLogName(selectedLog)
                : t("cron.executionLogs", { defaultValue: "执行日志" })}
            </p>
            {!selectedLog && (
              <span className="text-xs text-muted-foreground ml-1">({logs.length})</span>
            )}
            {!selectedLog && (
              <button
                onClick={() => void refetchLogs()}
                disabled={isRefetchingLogs}
                className="ml-auto text-muted-foreground hover:text-foreground disabled:opacity-50"
                title={t("common.refresh", { defaultValue: "刷新" })}
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isRefetchingLogs && "animate-spin")} />
              </button>
            )}
          </div>

          {selectedLog ? (
            <div className="flex-1 rounded-lg bg-muted/30 border px-4 py-3 text-sm overflow-auto">
              <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                <Markdown remarkPlugins={[remarkGfm]}>{logContent ?? ""}</Markdown>
              </div>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex-1 rounded-lg bg-muted/30 border flex items-center justify-center text-sm text-muted-foreground">
              {t("cron.noLogs", { defaultValue: "暂无执行记录" })}
            </div>
          ) : (
            <div className="flex-1 rounded-lg border overflow-auto">
              {logs.map((log, i) => (
                <button
                  key={log.filename}
                  onClick={() => setSelectedLog(log.filename)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors",
                    i !== logs.length - 1 && "border-b",
                  )}
                >
                  <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm flex-1">{formatLogName(log.filename)}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {log.size < 1024 ? `${log.size}B` : `${(log.size / 1024).toFixed(1)}KB`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirm */}
      <Dialog open={confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(false); }}>
        <DialogContent className="sm:max-w-sm focus:outline-none" onInteractOutside={() => setConfirmDelete(false)}>
          <DialogHeader>
            <DialogTitle className="text-sm">{t("cron.deleteConfirm", { defaultValue: "删除此定时任务？此操作无法撤销。" })}</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              {t("common.cancel", { defaultValue: "取消" })}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { onDelete(job.id); setConfirmDelete(false); }}
            >
              {t("common.delete", { defaultValue: "删除" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
