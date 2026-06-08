import { invoke } from "@tauri-apps/api/core";

// Raw shape returned by Hermes /api/jobs
export interface CronJobRaw {
  id: string;
  name: string;
  schedule: { kind: string; expr: string; display: string } | string;
  schedule_display?: string;
  prompt: string;
  enabled: boolean;
  model?: string | null;
  last_run_at?: string | null;
  next_run_at?: string | null;
  last_status?: string | null;
  state?: string | null;
}

// Normalized shape used in the UI
export interface CronJob {
  id: string;
  name: string;
  schedule: string; // always the cron expr string
  prompt: string;
  enabled: boolean;
  model?: string | null;
  last_run?: string | null;
  next_run?: string | null;
  status?: string | null;
}

export interface CreateCronJobRequest {
  name: string;
  schedule: string;
  prompt: string;
  enabled?: boolean;
  model?: string | null;
}

export interface UpdateCronJobRequest {
  name?: string;
  schedule?: string;
  prompt?: string;
  enabled?: boolean;
  model?: string | null;
}

function normalizeJob(raw: CronJobRaw): CronJob {
  const scheduleExpr =
    typeof raw.schedule === "string"
      ? raw.schedule
      : (raw.schedule?.expr ?? raw.schedule_display ?? "");
  return {
    id: raw.id,
    name: raw.name,
    schedule: scheduleExpr,
    prompt: raw.prompt,
    enabled: raw.enabled,
    model: raw.model,
    last_run: raw.last_run_at,
    next_run: raw.next_run_at,
    status: raw.last_status ?? raw.state,
  };
}

export const cronApi = {
  list: async (includeDisabled = true): Promise<CronJob[]> => {
    const raws = await invoke<CronJobRaw[]>("listCronJobs", {
      includeDisabled,
    });
    return raws.map(normalizeJob);
  },

  get: async (jobId: string): Promise<CronJob> => {
    const raw = await invoke<CronJobRaw>("getCronJob", { jobId });
    return normalizeJob(raw);
  },

  create: async (job: CreateCronJobRequest): Promise<CronJob> => {
    const raw = await invoke<CronJobRaw>("createCronJob", { job });
    return normalizeJob(raw);
  },

  update: async (
    jobId: string,
    job: UpdateCronJobRequest,
  ): Promise<CronJob> => {
    const raw = await invoke<CronJobRaw>("updateCronJob", { jobId, job });
    return normalizeJob(raw);
  },

  delete: (jobId: string) => invoke<void>("deleteCronJob", { jobId }),

  trigger: (jobId: string) =>
    invoke<{ run_id: string }>("triggerCronJob", { jobId }),
};
