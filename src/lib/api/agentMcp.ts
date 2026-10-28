import { invoke } from "@tauri-apps/api/core";

export type McpTransport = "http" | "stdio";
export type McpProtocol = "auto" | "stateless" | "legacy";

export interface McpToolFilter {
  include?: string[];
  exclude?: string[];
}

/**
 * 读取返回（后端 `_mcp_server_summary`）。
 * 注意：不包含 `headers` —— 后端刻意不回传 Authorization 等敏感头。
 */
export interface AgentMcpServer {
  name: string;
  transport: McpTransport;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  auth?: string;
  enabled: boolean;
  protocol?: McpProtocol;
  tools?: McpToolFilter | null;
}

/** 写入 body（POST / PUT `.../mcp`） */
export interface AgentMcpServerInput {
  name: string;
  url?: string;
  command?: string;
  protocol?: McpProtocol;
  headers?: Record<string, string>;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
  connect_timeout?: number;
  auth?: string;
  tools?: McpToolFilter;
}

export interface McpTestResult {
  ok: boolean;
  error?: string;
  tools: string[];
}

/** 变更类接口统一返回 `restart_required` —— true 表示需调 restart 才生效 */
export interface McpChangeResult {
  restart_required?: boolean;
}

function normalizeServers(data: unknown): AgentMcpServer[] {
  if (Array.isArray(data)) return data as AgentMcpServer[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.servers)) return obj.servers as AgentMcpServer[];
  }
  return [];
}

function normalizeTestResult(data: unknown): McpTestResult {
  const obj = (data ?? {}) as Record<string, unknown>;
  return {
    ok: obj.ok === true,
    error: typeof obj.error === "string" ? obj.error : undefined,
    tools: Array.isArray(obj.tools) ? (obj.tools as string[]) : [],
  };
}

export const agentMcpApi = {
  async list(agentId: string): Promise<AgentMcpServer[]> {
    return normalizeServers(
      await invoke<unknown>("getAgentMcpServers", { agentId }),
    );
  },

  /** name 已存在时后端按覆盖处理，新增和编辑走同一条路径 */
  async upsert(
    agentId: string,
    server: AgentMcpServerInput,
  ): Promise<McpChangeResult> {
    return await invoke<McpChangeResult>("addAgentMcpServer", {
      agentId,
      server,
    });
  },

  async remove(agentId: string, name: string): Promise<McpChangeResult> {
    return await invoke<McpChangeResult>("deleteAgentMcpServer", {
      agentId,
      name,
    });
  },

  async test(agentId: string, name: string): Promise<McpTestResult> {
    return normalizeTestResult(
      await invoke<unknown>("testAgentMcpServer", { agentId, name }),
    );
  },

  async setEnabled(
    agentId: string,
    name: string,
    enabled: boolean,
  ): Promise<McpChangeResult> {
    return await invoke<McpChangeResult>("setAgentMcpServerEnabled", {
      agentId,
      name,
      enabled,
    });
  },
};
