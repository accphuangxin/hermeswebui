import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import type { CronJob, CreateCronJobRequest } from "@/lib/api/cron";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface CronJobFormDialogProps {
  open: boolean;
  job: CronJob | null;
  onClose: () => void;
  onSubmit: (data: CreateCronJobRequest) => void;
  isPending: boolean;
}

interface FormValues {
  name: string;
  schedule: string;
  prompt: string;
  enabled: boolean;
  model: string;
}

const SCHEDULE_PRESETS = [
  { label: "每分钟", value: "* * * * *" },
  { label: "每小时", value: "0 * * * *" },
  { label: "每天 8:00", value: "0 8 * * *" },
  { label: "每周一 9:00", value: "0 9 * * 1" },
];

export function CronJobFormDialog({
  open,
  job,
  onClose,
  onSubmit,
  isPending,
}: CronJobFormDialogProps) {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      name: "",
      schedule: "0 * * * *",
      prompt: "",
      enabled: true,
      model: "",
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: job?.name ?? "",
        schedule: job?.schedule ?? "0 * * * *",
        prompt: job?.prompt ?? "",
        enabled: job?.enabled ?? true,
        model: job?.model ?? "",
      });
    }
  }, [open, job, reset]);

  const onValid = (values: FormValues) => {
    onSubmit({
      name: values.name.trim(),
      schedule: values.schedule.trim(),
      prompt: values.prompt.trim(),
      enabled: values.enabled,
      model: values.model.trim() || null,
    });
  };

  const enabled = watch("enabled");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl p-0 gap-0 focus:outline-none overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-base font-semibold">
            {job
              ? t("cron.editTitle", { defaultValue: "编辑定时任务" })
              : t("cron.newTitle", { defaultValue: "新建定时任务" })}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onValid)}>
          <div className="px-6 py-5 space-y-5">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {t("cron.form.name", { defaultValue: "任务名称" })}
                <span className="text-destructive ml-0.5">*</span>
              </label>
              <Input
                {...register("name", { required: true })}
                placeholder={t("cron.form.namePlaceholder", {
                  defaultValue: "例：每日早报",
                })}
                className={cn(
                  "h-9",
                  errors.name &&
                    "border-destructive focus-visible:ring-destructive",
                )}
                autoFocus
              />
            </div>

            {/* Schedule */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {t("cron.form.schedule", { defaultValue: "执行频率" })}
                <span className="text-destructive ml-0.5">*</span>
              </label>
              <Input
                {...register("schedule", { required: true })}
                placeholder="0 8 * * *"
                className={cn(
                  "h-9 font-mono tracking-wide",
                  errors.schedule &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
              <div className="flex flex-wrap gap-2 pt-0.5">
                {SCHEDULE_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setValue("schedule", p.value)}
                    className="text-xs px-2.5 py-1 rounded-md border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {t("cron.form.prompt", { defaultValue: "执行 Prompt" })}
                <span className="text-destructive ml-0.5">*</span>
              </label>
              <Textarea
                {...register("prompt", { required: true })}
                placeholder={t("cron.form.promptPlaceholder", {
                  defaultValue: "输入要定期执行的任务描述...",
                })}
                rows={5}
                className={cn(
                  "resize-none leading-relaxed",
                  errors.prompt &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
            </div>

            {/* Model + Enabled — same row on larger screens */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  {t("cron.form.model", { defaultValue: "模型" })}
                  <span className="text-xs text-muted-foreground ml-1.5">
                    {t("cron.form.modelOptional", { defaultValue: "（可选）" })}
                  </span>
                </label>
                <Input
                  {...register("model")}
                  placeholder={t("cron.form.modelPlaceholder", {
                    defaultValue: "留空使用默认模型",
                  })}
                  className="h-9"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border px-4 h-9">
                <span className="text-sm font-medium">
                  {t("cron.form.enabled", { defaultValue: "启用任务" })}
                </span>
                <Switch
                  checked={enabled}
                  onCheckedChange={(v) => setValue("enabled", v)}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-muted/20 gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("common.cancel", { defaultValue: "取消" })}
            </Button>
            <Button type="submit" disabled={isPending} className="min-w-[72px]">
              {isPending
                ? t("common.saving", { defaultValue: "保存中..." })
                : t("common.save", { defaultValue: "保存" })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
