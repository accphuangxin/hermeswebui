import { invoke } from "@tauri-apps/api/core";

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
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

export const cronApi = {
  list: (includeDisabled = true) =>
    invoke<CronJob[]>("listCronJobs", { includeDisabled }),

  get: (jobId: string) => invoke<CronJob>("getCronJob", { jobId }),

  create: (job: CreateCronJobRequest) =>
    invoke<CronJob>("createCronJob", { job }),

  update: (jobId: string, job: UpdateCronJobRequest) =>
    invoke<CronJob>("updateCronJob", { jobId, job }),

  delete: (jobId: string) => invoke<void>("deleteCronJob", { jobId }),

  trigger: (jobId: string) =>
    invoke<{ run_id: string }>("triggerCronJob", { jobId }),
};
