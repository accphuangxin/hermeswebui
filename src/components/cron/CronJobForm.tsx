import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import type { CronJob, CreateCronJobRequest } from "@/lib/api/cron";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface CronJobFormProps {
  job: CronJob | null;   // null = new job
  onCancel: () => void;
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

export function CronJobForm({ job, onCancel, onSubmit, isPending }: CronJobFormProps) {
  const { t } = useTranslation();
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } =
    useForm<FormValues>({
      defaultValues: { name: "", schedule: "0 * * * *", prompt: "", enabled: true, model: "" },
    });

  useEffect(() => {
    reset({
      name: job?.name ?? "",
      schedule: job?.schedule ?? "0 * * * *",
      prompt: job?.prompt ?? "",
      enabled: job?.enabled ?? true,
      model: job?.model ?? "",
    });
  }, [job, reset]);

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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 h-10 border-b shrink-0">
        <span className="text-sm font-medium">
          {job
            ? t("cron.editTitle", { defaultValue: "编辑任务" })
            : t("cron.newTitle", { defaultValue: "新建任务" })}
        </span>
      </div>

      {/* Form body — scrollable */}
      <form onSubmit={handleSubmit(onValid)} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-auto px-6 py-5 space-y-5">

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("cron.form.name", { defaultValue: "任务名称" })}
              <span className="text-destructive ml-0.5">*</span>
            </label>
            <Input
              {...register("name", { required: true })}
              placeholder={t("cron.form.namePlaceholder", { defaultValue: "例：每日早报" })}
              className={cn("h-9", errors.name && "border-destructive")}
              autoFocus
            />
          </div>

          {/* Schedule */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("cron.form.schedule", { defaultValue: "执行频率" })}
              <span className="text-destructive ml-0.5">*</span>
            </label>
            <Input
              {...register("schedule", { required: true })}
              placeholder="0 8 * * *"
              className={cn("h-9 font-mono tracking-wide", errors.schedule && "border-destructive")}
            />
            <div className="flex flex-wrap gap-1.5 pt-0.5">
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
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("cron.form.prompt", { defaultValue: "执行 Prompt" })}
              <span className="text-destructive ml-0.5">*</span>
            </label>
            <Textarea
              {...register("prompt", { required: true })}
              placeholder={t("cron.form.promptPlaceholder", { defaultValue: "输入要定期执行的任务描述..." })}
              rows={6}
              className={cn("resize-none leading-relaxed", errors.prompt && "border-destructive")}
            />
          </div>

          {/* Model + Enabled */}
          <div className="grid grid-cols-2 gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("cron.form.model", { defaultValue: "模型" })}
                <span className="text-xs text-muted-foreground ml-1 normal-case">
                  {t("cron.form.modelOptional", { defaultValue: "（可选）" })}
                </span>
              </label>
              <Input
                {...register("model")}
                placeholder={t("cron.form.modelPlaceholder", { defaultValue: "留空使用默认" })}
                className="h-9"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-4 h-9">
              <span className="text-sm">
                {t("cron.form.enabled", { defaultValue: "启用" })}
              </span>
              <Switch checked={enabled} onCheckedChange={(v) => setValue("enabled", v)} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t bg-muted/20 shrink-0">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t("common.cancel", { defaultValue: "取消" })}
          </Button>
          <Button type="submit" size="sm" disabled={isPending} className="min-w-[64px]">
            {isPending
              ? t("common.saving", { defaultValue: "保存中..." })
              : t("common.save", { defaultValue: "保存" })}
          </Button>
        </div>
      </form>
    </div>
  );
}
