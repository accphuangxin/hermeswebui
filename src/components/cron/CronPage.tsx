import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Play, Pencil, Trash2, Power, PowerOff, Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cronApi, type CronJob, type CreateCronJobRequest, type UpdateCronJobRequest } from "@/lib/api/cron";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CronJobFormDialog } from "./CronJobFormDialog";
import { cn } from "@/lib/utils";

const cronKeys = {
  all: ["cron"] as const,
  list: ["cron", "list"] as const,
};

export function CronPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);

  const { data: jobs = [], isLoading, refetch } = useQuery({
    queryKey: cronKeys.list,
    queryFn: () => cronApi.list(true),
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: (job: CreateCronJobRequest) => cronApi.create(job),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cronKeys.list });
      setFormOpen(false);
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cronKeys.list });
      toast.success(t("cron.deleted", { defaultValue: "任务已删除" }));
    },
    onError: (e) => toast.error(String(e)),
  });

  const triggerMutation = useMutation({
    mutationFn: (id: string) => cronApi.trigger(id),
    onSuccess: () =>
      toast.success(t("cron.triggered", { defaultValue: "任务已触发执行" })),
    onError: (e) => toast.error(String(e)),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      cronApi.update(id, { enabled }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: cronKeys.list }),
    onError: (e) => toast.error(String(e)),
  });

  const handleSubmit = (data: CreateCronJobRequest) => {
    if (editingJob) {
      updateMutation.mutate({ id: editingJob.id, job: data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (job: CronJob) => {
    setEditingJob(job);
    setFormOpen(true);
  };

  const handleNew = () => {
    setEditingJob(null);
    setFormOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div>
          <h2 className="text-sm font-semibold">
            {t("cron.title", { defaultValue: "定时任务" })}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("cron.subtitle", { defaultValue: "管理定期执行的 Agent 任务" })}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => void refetch()}
            title={t("cron.refresh", { defaultValue: "刷新" })}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
          </Button>
          <Button size="sm" className="h-7 gap-1.5" onClick={handleNew}>
            <Plus className="w-3.5 h-3.5" />
            {t("cron.new", { defaultValue: "新建任务" })}
          </Button>
        </div>
      </div>

      {/* Job list */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            {t("cron.loading", { defaultValue: "加载中..." })}
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <Clock className="w-8 h-8 opacity-30" />
            <p className="text-sm">{t("cron.empty", { defaultValue: "暂无定时任务" })}</p>
            <Button variant="outline" size="sm" onClick={handleNew}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              {t("cron.new", { defaultValue: "新建任务" })}
            </Button>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {jobs.map((job) => (
              <CronJobCard
                key={job.id}
                job={job}
                onEdit={handleEdit}
                onDelete={(id) => deleteMutation.mutate(id)}
                onTrigger={(id) => triggerMutation.mutate(id)}
                onToggle={(id, enabled) => toggleMutation.mutate({ id, enabled })}
                isTriggering={triggerMutation.isPending && triggerMutation.variables === job.id}
              />
            ))}
          </div>
        )}
      </ScrollArea>

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

// ── Card ──────────────────────────────────────────────────────────────────────

interface CronJobCardProps {
  job: CronJob;
  onEdit: (job: CronJob) => void;
  onDelete: (id: string) => void;
  onTrigger: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  isTriggering: boolean;
}

function CronJobCard({ job, onEdit, onDelete, onTrigger, onToggle, isTriggering }: CronJobCardProps) {
  const { t } = useTranslation();

  const statusColor = {
    running: "bg-blue-500",
    completed: "bg-green-500",
    failed: "bg-red-500",
    pending: "bg-yellow-500",
  }[job.status ?? ""] ?? "bg-muted-foreground";

  return (
    <div className={cn(
      "rounded-lg border p-3 space-y-2 transition-opacity",
      !job.enabled && "opacity-50",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{job.name}</span>
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono shrink-0">
              {job.schedule}
            </code>
            {job.status && (
              <Badge variant="outline" className="text-xs gap-1 shrink-0">
                <span className={cn("w-1.5 h-1.5 rounded-full", statusColor)} />
                {job.status}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{job.prompt}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
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
            title={job.enabled
              ? t("cron.disable", { defaultValue: "禁用" })
              : t("cron.enable", { defaultValue: "启用" })}
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

      {/* Times */}
      {(job.last_run || job.next_run) && (
        <div className="flex gap-4 text-xs text-muted-foreground">
          {job.last_run && (
            <span>{t("cron.lastRun", { defaultValue: "上次执行" })}: {job.last_run}</span>
          )}
          {job.next_run && (
            <span>{t("cron.nextRun", { defaultValue: "下次执行" })}: {job.next_run}</span>
          )}
        </div>
      )}
    </div>
  );
}
