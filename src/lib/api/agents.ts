import { invoke } from "@tauri-apps/api/core";

export interface HermesAgent {
  id: string;
  name?: string;
  alias?: string;
  description?: string;
  model?: string;
  provider?: string;
  isDefault?: boolean;
  gatewayRunning?: boolean;
  skillCount?: number;
  skills?: string[];
  apiServerPort?: number;
  apiServerKey?: string;
}

export const agentsApi = {
  async getAgents(): Promise<HermesAgent[]> {
    return await invoke("getHermesAgents");
  },
};
