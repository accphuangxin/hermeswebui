import { invoke } from "@tauri-apps/api/core";

export interface HermesAgent {
  id: string;
  name?: string;
  description?: string;
  model?: string;
  skills?: string[];
}

export const agentsApi = {
  async getAgents(): Promise<HermesAgent[]> {
    return await invoke("getHermesAgents");
  },
};
