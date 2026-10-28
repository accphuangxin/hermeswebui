import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentMcpApi, type AgentMcpServerInput } from "@/lib/api/agentMcp";

function mcpKeys(agentId: string | undefined) {
  return ["agentMcp", agentId] as const;
}

export function useAgentMcpServers(agentId: string | undefined) {
  return useQuery({
    queryKey: mcpKeys(agentId),
    queryFn: () => agentMcpApi.list(agentId!),
    enabled: !!agentId,
    retry: 1,
  });
}

function useInvalidateMcp(agentId: string | undefined) {
  const queryClient = useQueryClient();
  return () => {
    if (agentId) {
      void queryClient.invalidateQueries({ queryKey: mcpKeys(agentId) });
    }
  };
}

export function useUpsertMcpServer(agentId: string | undefined) {
  const invalidate = useInvalidateMcp(agentId);
  return useMutation({
    mutationFn: (server: AgentMcpServerInput) =>
      agentMcpApi.upsert(agentId!, server),
    onSuccess: invalidate,
  });
}

export function useDeleteMcpServer(agentId: string | undefined) {
  const invalidate = useInvalidateMcp(agentId);
  return useMutation({
    mutationFn: (name: string) => agentMcpApi.remove(agentId!, name),
    onSuccess: invalidate,
  });
}

export function useTestMcpServer(agentId: string | undefined) {
  return useMutation({
    mutationFn: (name: string) => agentMcpApi.test(agentId!, name),
  });
}

export function useSetMcpServerEnabled(agentId: string | undefined) {
  const invalidate = useInvalidateMcp(agentId);
  return useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      agentMcpApi.setEnabled(agentId!, name, enabled),
    onSuccess: invalidate,
  });
}
