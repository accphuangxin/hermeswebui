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

function agentUrl(port: number, path: string) {
  return `http://127.0.0.1:${port}${path}`;
}

function authHeaders(key: string): HeadersInit {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function checkResponse(res: Response, label: string): Promise<void> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${label} failed (${res.status}): ${text}`);
  }
}

export const agentProvidersApi = {
  async list(port: number, key: string): Promise<AgentProvider[]> {
    const res = await fetch(agentUrl(port, "/v1/providers"), {
      headers: authHeaders(key),
    });
    await checkResponse(res, "GET /v1/providers");
    const data = await res.json() as unknown;
    if (Array.isArray(data)) return data as AgentProvider[];
    // Some implementations wrap in { providers: [...] }
    if (data && typeof data === "object" && "providers" in data) {
      return (data as { providers: AgentProvider[] }).providers;
    }
    return [];
  },

  async upsert(port: number, key: string, input: UpsertProviderInput): Promise<void> {
    const res = await fetch(agentUrl(port, "/v1/providers"), {
      method: "POST",
      headers: authHeaders(key),
      body: JSON.stringify(input),
    });
    await checkResponse(res, "POST /v1/providers");
  },

  async delete(port: number, key: string, name: string): Promise<void> {
    const res = await fetch(agentUrl(port, `/v1/providers/${encodeURIComponent(name)}`), {
      method: "DELETE",
      headers: authHeaders(key),
    });
    await checkResponse(res, "DELETE /v1/providers");
  },
};
