import { invoke } from "@tauri-apps/api/core";

export interface HermesAgent {
  id: string;
  name: string;
  object?: string;
  description?: string;
  model?: string;
  provider?: string;
  host?: string;
  apiServerPort?: number;
  apiServerKey?: string;
  actualPort?: number;
  status?: string;
  gatewayRunning?: boolean;
  skillCount?: number;
  isDefault?: boolean;
  source?: string;
  soul?: string;
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  soul?: string;
  clone?: boolean;
  api_server_port?: number;
  api_server_key?: string;
}

export interface UpdateAgentInput {
  description?: string;
  soul?: string;
  model?: string;
  provider?: string;
  api_server_port?: number;
  api_server_key?: string;
}

export const agentsApi = {
  async getAgents(): Promise<HermesAgent[]> {
    return await invoke("getHermesAgents");
  },
  async createAgent(input: CreateAgentInput): Promise<HermesAgent> {
    return await invoke("createHermesAgent", { input });
  },
  async deleteAgent(agentId: string): Promise<void> {
    return await invoke("deleteHermesAgent", { agentId });
  },
  async startAgent(agentId: string): Promise<void> {
    return await invoke("startHermesAgent", { agentId });
  },
  async stopAgent(agentId: string): Promise<void> {
    return await invoke("stopHermesAgent", { agentId });
  },
  async restartAgent(agentId: string): Promise<void> {
    return await invoke("restartHermesAgent", { agentId });
  },
  async updateAgent(
    agentId: string,
    input: UpdateAgentInput,
  ): Promise<HermesAgent> {
    return await invoke("updateHermesAgent", { agentId, input });
  },
};
