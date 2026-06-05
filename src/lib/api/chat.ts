import { invoke } from "@tauri-apps/api/core";
import type { ChatSession, ChatMessage, HermesChatStatus, HermesChatModel } from "@/types";

export interface SaveMessageInput {
  id: string;
  role: string;
  content: string;
  toolCalls?: string | null;
  toolCallId?: string | null;
  name?: string | null;
  fileRefs?: string | null;
}

export const chatApi = {
  async createSession(
    id: string,
    title?: string | null,
    model?: string | null,
    systemPrompt?: string | null,
    projectDir?: string | null,
    agentId?: string | null,
  ): Promise<ChatSession> {
    return await invoke("createChatSession", {
      id,
      title: title ?? null,
      model: model ?? null,
      systemPrompt: systemPrompt ?? null,
      projectDir: projectDir ?? null,
      agentId: agentId ?? null,
    });
  },

  async listSessions(agentId?: string | null): Promise<ChatSession[]> {
    return await invoke("listChatSessions", { agentId: agentId ?? null });
  },

  async getSession(sessionId: string): Promise<ChatSession | null> {
    return await invoke("getChatSession", { sessionId });
  },

  async updateSession(
    sessionId: string,
    title?: string | null,
    model?: string | null,
    systemPrompt?: string | null,
  ): Promise<boolean> {
    return await invoke("updateChatSession", {
      sessionId,
      title: title ?? null,
      model: model ?? null,
      systemPrompt: systemPrompt ?? null,
    });
  },

  async deleteSession(sessionId: string): Promise<boolean> {
    return await invoke("deleteChatSession", { sessionId });
  },

  async saveMessage(
    sessionId: string,
    message: SaveMessageInput,
  ): Promise<ChatMessage> {
    return await invoke("saveChatMessage", { sessionId, message });
  },

  async saveMessagesBatch(
    sessionId: string,
    messages: SaveMessageInput[],
  ): Promise<ChatMessage[]> {
    return await invoke("saveChatMessagesBatch", { sessionId, messages });
  },

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    return await invoke("getChatMessages", { sessionId });
  },

  async deleteMessage(messageId: string): Promise<boolean> {
    return await invoke("deleteChatMessage", { messageId });
  },

  async clearMessages(sessionId: string): Promise<number> {
    return await invoke("clearChatMessages", { sessionId });
  },

  async getStatus(): Promise<HermesChatStatus> {
    return await invoke("getHermesChatStatus");
  },

  async getModels(): Promise<HermesChatModel[]> {
    return await invoke("getHermesChatModels");
  },

  async stopRun(runId: string): Promise<boolean> {
    return await invoke("stopChatRun", { runId });
  },

  async approveRun(runId: string, approve: boolean): Promise<boolean> {
    return await invoke("approveChatRun", { runId, approve });
  },

  async getRunStatus(runId: string): Promise<Record<string, unknown>> {
    return await invoke("getChatRunStatus", { runId });
  },

  async readFile(path: string): Promise<{ filename: string; content: string; sizeBytes: number; mimeType: string }> {
    return await invoke("readChatFile", { path });
  },
};
