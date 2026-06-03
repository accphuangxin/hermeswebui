import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chatApi, type SaveMessageInput } from "@/lib/api/chat";
import { agentsApi } from "@/lib/api/agents";

export const chatKeys = {
  all: ["hermesChat"] as const,
  status: ["hermesChat", "status"] as const,
  models: ["hermesChat", "models"] as const,
  agents: ["hermesChat", "agents"] as const,
  sessions: ["hermesChat", "sessions"] as const,
  session: (id: string) => ["hermesChat", "session", id] as const,
  messages: (sessionId: string) => ["hermesChat", "messages", sessionId] as const,
};

export function useChatStatus(enabled: boolean) {
  return useQuery({
    queryKey: chatKeys.status,
    queryFn: () => chatApi.getStatus(),
    enabled,
    refetchInterval: 5000,
  });
}

export function useChatModels() {
  return useQuery({
    queryKey: chatKeys.models,
    queryFn: () => chatApi.getModels(),
  });
}

export function useHermesAgents(enabled: boolean) {
  return useQuery({
    queryKey: chatKeys.agents,
    queryFn: () => agentsApi.getAgents(),
    enabled,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
}

export function useChatSessions() {
  return useQuery({
    queryKey: chatKeys.sessions,
    queryFn: () => chatApi.listSessions(),
  });
}

export function useChatMessages(sessionId: string | null) {
  return useQuery({
    queryKey: chatKeys.messages(sessionId ?? ""),
    queryFn: () => chatApi.getMessages(sessionId!),
    enabled: !!sessionId,
  });
}

export function useCreateChatSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      id: string;
      title?: string | null;
      model?: string | null;
      systemPrompt?: string | null;
      projectDir?: string | null;
    }) =>
      chatApi.createSession(
        params.id,
        params.title,
        params.model,
        params.systemPrompt,
        params.projectDir,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.sessions });
    },
  });
}

export function useUpdateChatSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      sessionId: string;
      title?: string | null;
      model?: string | null;
      systemPrompt?: string | null;
    }) => chatApi.updateSession(params.sessionId, params.title, params.model, params.systemPrompt),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.sessions });
    },
  });
}

export function useDeleteChatSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => chatApi.deleteSession(sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.sessions });
    },
  });
}

export function useSaveChatMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { sessionId: string; message: SaveMessageInput }) =>
      chatApi.saveMessage(params.sessionId, params.message),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: chatKeys.messages(variables.sessionId),
      });
      void queryClient.invalidateQueries({ queryKey: chatKeys.sessions });
    },
  });
}

export function useDeleteChatMessage(sessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => chatApi.deleteMessage(messageId),
    onSuccess: () => {
      if (sessionId) {
        void queryClient.invalidateQueries({
          queryKey: chatKeys.messages(sessionId),
        });
      }
    },
  });
}

export function useSaveChatMessagesBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { sessionId: string; messages: SaveMessageInput[] }) =>
      chatApi.saveMessagesBatch(params.sessionId, params.messages),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: chatKeys.messages(variables.sessionId),
      });
      void queryClient.invalidateQueries({ queryKey: chatKeys.sessions });
    },
  });
}
