import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentProvidersApi, type UpsertProviderInput } from "@/lib/api/agentProviders";

function providerKeys(port: number, key: string) {
  return ["agentProviders", port, key] as const;
}

export function useAgentProviders(port: number | undefined, key: string | undefined) {
  return useQuery({
    queryKey: ["agentProviders", port, key],
    queryFn: () => agentProvidersApi.list(port!, key!),
    enabled: !!port && !!key,
    retry: 1,
  });
}

export function useUpsertProvider(port: number | undefined, key: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertProviderInput) => agentProvidersApi.upsert(port!, key!, input),
    onSuccess: () => {
      if (port && key) {
        void queryClient.invalidateQueries({ queryKey: providerKeys(port, key) });
      }
    },
  });
}

export function useDeleteProvider(port: number | undefined, key: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => agentProvidersApi.delete(port!, key!, name),
    onSuccess: () => {
      if (port && key) {
        void queryClient.invalidateQueries({ queryKey: providerKeys(port, key) });
      }
    },
  });
}
