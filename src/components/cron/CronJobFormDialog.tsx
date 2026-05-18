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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

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
  { label: "每天 8 点", value: "0 8 * * *" },
  { label: "每周一 9 点", value: "0 9 * * 1" },
];

export function CronJobFormDialog({
  open,
  job,
  onClose,
  onSubmit,
  isPending,
}: CronJobFormDialogProps) {
  const { t } = useTranslation();
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } =
    useForm<FormValues>({
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
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {job
              ? t("cron.editTitle", { defaultValue: "编辑定时任务" })
              : t("cron.newTitle", { defaultValue: "新建定时任务" })}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onValid)} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>{t("cron.form.name", { defaultValue: "任务名称" })}</Label>
            <Input
              {...register("name", { required: true })}
              placeholder={t("cron.form.namePlaceholder", { defaultValue: "例：每日早报" })}
              className={errors.name ? "border-destructive" : ""}
            />
          </div>

          {/* Schedule */}
          <div className="space-y-1.5">
            <Label>{t("cron.form.schedule", { defaultValue: "Cron 表达式" })}</Label>
            <Input
              {...register("schedule", { required: true })}
              placeholder="0 8 * * *"
              className={cn("font-mono text-sm", errors.schedule ? "border-destructive" : "")}
            />
            <div className="flex flex-wrap gap-1.5 mt-1">
              {SCHEDULE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setValue("schedule", p.value)}
                  className="text-xs px-2 py-0.5 rounded border hover:bg-muted transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div className="space-y-1.5">
            <Label>{t("cron.form.prompt", { defaultValue: "执行 Prompt" })}</Label>
            <Textarea
              {...register("prompt", { required: true })}
              placeholder={t("cron.form.promptPlaceholder", { defaultValue: "输入要定期执行的任务描述..." })}
              rows={4}
              className={errors.prompt ? "border-destructive" : ""}
            />
          </div>

          {/* Model (optional) */}
          <div className="space-y-1.5">
            <Label>
              {t("cron.form.model", { defaultValue: "模型（可选）" })}
            </Label>
            <Input
              {...register("model")}
              placeholder={t("cron.form.modelPlaceholder", { defaultValue: "留空使用默认模型" })}
            />
          </div>

          {/* Enabled */}
          <div className="flex items-center justify-between">
            <Label>{t("cron.form.enabled", { defaultValue: "启用任务" })}</Label>
            <Switch
              checked={enabled}
              onCheckedChange={(v) => setValue("enabled", v)}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {t("common.cancel", { defaultValue: "取消" })}
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
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

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
