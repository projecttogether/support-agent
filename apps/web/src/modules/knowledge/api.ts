import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  KnowledgeSource,
  KnowledgeSourceCreate,
  KnowledgeSourceUpdate,
  KnowledgeTestResult,
} from "@support-agent/shared/api/knowledge";
import { api } from "@/lib/api";

export const knowledgeKeys = { all: ["knowledge"] as const, list: ["knowledge", "list"] as const };

/** Every signed-in role may read the list (the agent form picks from it). */
export const knowledgeSourcesQuery = {
  queryKey: knowledgeKeys.list,
  queryFn: () => api.get<{ items: KnowledgeSource[] }>("/knowledge-sources").then((data) => data.items),
};

export function useKnowledgeSources() {
  return useQuery(knowledgeSourcesQuery);
}

/** Adding or deleting a source also changes the overview's setup checklist. */
function useInvalidateKnowledgeSources() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: knowledgeKeys.all }),
      client.invalidateQueries({ queryKey: ["status"] }),
    ]);
}

export function useCreateKnowledgeSource() {
  const invalidate = useInvalidateKnowledgeSources();
  return useMutation({
    mutationFn: (input: KnowledgeSourceCreate) => api.post<KnowledgeSource>("/knowledge-sources", input),
    onSuccess: invalidate,
  });
}

export function useUpdateKnowledgeSource() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: KnowledgeSourceUpdate & { id: string }) =>
      api.patch<KnowledgeSource>(`/knowledge-sources/${id}`, input),
    onSuccess: () => client.invalidateQueries({ queryKey: knowledgeKeys.all }),
  });
}

export function useDeleteKnowledgeSource() {
  const invalidate = useInvalidateKnowledgeSources();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/knowledge-sources/${id}`),
    onSuccess: invalidate,
  });
}

export function useTestKnowledgeSource() {
  return useMutation({
    mutationFn: ({ id, query }: { id: string; query: string }) =>
      api.post<KnowledgeTestResult>(`/knowledge-sources/${id}/test`, { query }),
  });
}
