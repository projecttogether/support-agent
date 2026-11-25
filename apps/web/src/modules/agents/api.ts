import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Agent,
  AgentInput,
  AgentTest,
  AgentTestInput,
  AgentUpdate,
  PreviewInput,
  PreviewResult,
  TestRunResult,
} from "@support-agent/shared/api/agents";
import { api } from "@/lib/api";
import { slackKeys } from "@/modules/slack/api";
import { providerKeys } from "@/modules/providers/api";
import { knowledgeKeys } from "@/modules/knowledge/api";

export const agentKeys = {
  all: ["agents"] as const,
  list: ["agents", "list"] as const,
  detail: (id: string) => ["agents", "detail", id] as const,
  tests: (id: string) => ["agents", "tests", id] as const,
};

export function useAgents() {
  return useQuery({
    queryKey: agentKeys.list,
    queryFn: () => api.get<{ items: Agent[] }>("/agents").then((data) => data.items),
  });
}

export const agentQuery = (id: string) => ({
  queryKey: agentKeys.detail(id),
  queryFn: () => api.get<Agent>(`/agents/${id}`),
});

export function useAgent(id: string) {
  return useQuery(agentQuery(id));
}

/** Agents change channel assignments, provider and knowledge source usage counts, and the setup status. */
function useInvalidateAgents() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: agentKeys.all }),
      client.invalidateQueries({ queryKey: slackKeys.channels }),
      client.invalidateQueries({ queryKey: providerKeys.list }),
      client.invalidateQueries({ queryKey: knowledgeKeys.list }),
      client.invalidateQueries({ queryKey: ["status"] }),
    ]);
}

export function useCreateAgent() {
  const invalidate = useInvalidateAgents();
  return useMutation({
    mutationFn: (input: AgentInput) => api.post<Agent>("/agents", input),
    onSuccess: invalidate,
  });
}

export function useUpdateAgent() {
  const client = useQueryClient();
  const invalidate = useInvalidateAgents();
  return useMutation({
    mutationFn: ({ id, ...input }: AgentUpdate & { id: string }) => api.put<Agent>(`/agents/${id}`, input),
    onSuccess: (agent) => {
      client.setQueryData(agentKeys.detail(agent.id), agent);
      return invalidate();
    },
  });
}

export function useDeleteAgent() {
  const invalidate = useInvalidateAgents();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/agents/${id}`),
    onSuccess: invalidate,
  });
}

/** Asks an agent a test question; a new agent (no id yet) is tested from its draft alone. */
export function usePreview(agentId: string | null) {
  return useMutation({
    mutationFn: (input: PreviewInput) =>
      api.post<PreviewResult>(agentId ? `/agents/${agentId}/preview` : "/agents/preview", input),
  });
}

export function useAgentTests(agentId: string) {
  return useQuery({
    queryKey: agentKeys.tests(agentId),
    queryFn: () => api.get<{ items: AgentTest[] }>(`/agents/${agentId}/tests`).then((data) => data.items),
  });
}

export function useSaveAgentTest(agentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: AgentTestInput & { id?: string }) =>
      id
        ? api.put<AgentTest>(`/agents/${agentId}/tests/${id}`, input)
        : api.post<AgentTest>(`/agents/${agentId}/tests`, input),
    onSuccess: () => client.invalidateQueries({ queryKey: agentKeys.tests(agentId) }),
  });
}

export function useDeleteAgentTest(agentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/agents/${agentId}/tests/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: agentKeys.tests(agentId) }),
  });
}

export function useRunAgentTest(agentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (testId: string) => api.post<AgentTest>(`/agents/${agentId}/tests/${testId}/run`, {}),
    onSuccess: () => client.invalidateQueries({ queryKey: agentKeys.tests(agentId) }),
  });
}

export function useRunAgentTests(agentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<TestRunResult>(`/agents/${agentId}/tests/run`, {}),
    onSuccess: (result) => {
      client.setQueryData(agentKeys.tests(agentId), result.tests);
      return client.invalidateQueries({ queryKey: agentKeys.tests(agentId) });
    },
  });
}
