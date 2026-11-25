import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CheckResult } from "@support-agent/shared/api/common";
import type {
  Provider,
  ProviderCreate,
  ProviderModels,
  ProviderUpdate,
} from "@support-agent/shared/api/providers";
import { api } from "@/lib/api";

export const providerKeys = {
  all: ["providers"] as const,
  list: ["providers", "list"] as const,
  models: (id: string) => ["providers", "models", id] as const,
};

/** Every signed-in role may read the list (the agent form picks from it). */
export function useProviders() {
  return useQuery({
    queryKey: providerKeys.list,
    queryFn: () => api.get<{ items: Provider[] }>("/providers").then((data) => data.items),
  });
}

/** Models the provider offers; may fail (e.g. a wrong key), then people type a model name. */
export function useProviderModels(id: string | null | undefined) {
  return useQuery({
    queryKey: providerKeys.models(id ?? ""),
    queryFn: () => api.get<ProviderModels>(`/providers/${id}/models`).then((data) => data.models),
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Adding or deleting a provider also changes the overview's setup checklist. */
function useInvalidateProviders() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: providerKeys.all }),
      client.invalidateQueries({ queryKey: ["status"] }),
    ]);
}

export function useCreateProvider() {
  const invalidate = useInvalidateProviders();
  return useMutation({
    mutationFn: (input: ProviderCreate) => api.post<Provider>("/providers", input),
    onSuccess: invalidate,
  });
}

export function useUpdateProvider() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: ProviderUpdate & { id: string }) =>
      api.patch<Provider>(`/providers/${id}`, input),
    onSuccess: () => client.invalidateQueries({ queryKey: providerKeys.all }),
  });
}

export function useDeleteProvider() {
  const invalidate = useInvalidateProviders();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/providers/${id}`),
    onSuccess: invalidate,
  });
}

export function useTestProvider() {
  return useMutation({
    mutationFn: ({ id, model }: { id: string; model: string }) =>
      api.post<CheckResult>(`/providers/${id}/test`, { model }),
  });
}
