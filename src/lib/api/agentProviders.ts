import { invoke } from "@tauri-apps/api/core";

export interface AgentProviderModel {
  context_length: number;
  supports_vision: boolean;
}

export interface AgentProvider {
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  models: Record<string, AgentProviderModel>;
}

export interface UpsertProviderInput {
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  models: Record<string, AgentProviderModel>;
}

export const agentProvidersApi = {
  async list(port: number, key: string): Promise<AgentProvider[]> {
    const data = await invoke<unknown>("listAgentProviders", {
      apiServerPort: port,
      apiServerKey: key,
    });
    if (Array.isArray(data)) return data as AgentProvider[];
    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      if (Array.isArray(obj.data)) return obj.data as AgentProvider[];
      if (Array.isArray(obj.custom_providers)) return obj.custom_providers as AgentProvider[];
      if (Array.isArray(obj.providers)) return obj.providers as AgentProvider[];
    }
    return [];
  },

  async upsert(port: number, key: string, input: UpsertProviderInput): Promise<void> {
    await invoke("upsertAgentProvider", {
      apiServerPort: port,
      apiServerKey: key,
      provider: input,
    });
  },

  async update(port: number, key: string, name: string, input: Partial<UpsertProviderInput>): Promise<void> {
    await invoke("updateAgentProvider", {
      apiServerPort: port,
      apiServerKey: key,
      name,
      provider: input,
    });
  },

  async delete(port: number, key: string, name: string): Promise<void> {
    await invoke("deleteAgentProvider", {
      apiServerPort: port,
      apiServerKey: key,
      name,
    });
  },
};
