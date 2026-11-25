import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SEARCH_API_CONFIG } from "@support-agent/shared/api/knowledge";
import type { Status } from "@support-agent/shared/api/status";
import { queryClient } from "@/lib/query";
import { stubFetch } from "@/test-utils";
import { useCreateKnowledgeSource, useDeleteKnowledgeSource } from "@/modules/knowledge/api";
import { useCreateProvider, useDeleteProvider } from "@/modules/providers/api";
import { statusQuery, useStatus } from "./api";

const ID = "7d9f3c56-63c4-4a3e-9d1b-4f7f6e2f9a10";

const status: Status = {
  version: null,
  bot: {
    state: "connected",
    startedAt: null,
    lastHeartbeatAt: null,
    lastEventAt: null,
    connectedSince: null,
    version: null,
  },
  setup: { slack: true, provider: false, knowledgeSource: false, agent: false },
  last24h: { messages: 0, answered: 0, silent: 0, noAnswer: 0, errors: 0, helpful: 0, notHelpful: 0 },
  recentErrors: [],
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

afterEach(() => {
  queryClient.clear();
  vi.unstubAllGlobals();
});

/**
 * The overview has just loaded its status (so it counts as fresh), the admin
 * makes a change elsewhere and comes back: the overview loads the status again.
 */
async function overviewReloadsAfter(change: () => Promise<unknown>) {
  queryClient.setQueryData(statusQuery.queryKey, status);
  const fetch = stubFetch({ status: 201, body: {} }, { body: status });
  await act(change);
  const overview = renderHook(() => useStatus(), { wrapper });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(fetch.mock.calls[1]![0]).toBe("/api/v1/status");
  overview.unmount();
}

describe("the overview's setup checklist", () => {
  it("refreshes after a provider is added or deleted", async () => {
    const create = renderHook(() => useCreateProvider(), { wrapper }).result;
    await overviewReloadsAfter(() =>
      create.current.mutateAsync({ name: "Anthropic", kind: "anthropic", apiKey: "sk-ant-example" }),
    );
    const remove = renderHook(() => useDeleteProvider(), { wrapper }).result;
    await overviewReloadsAfter(() => remove.current.mutateAsync(ID));
  });

  it("refreshes after a knowledge source is added or deleted", async () => {
    const create = renderHook(() => useCreateKnowledgeSource(), { wrapper }).result;
    await overviewReloadsAfter(() =>
      create.current.mutateAsync({ name: "Wiki", kind: "search_api", config: DEFAULT_SEARCH_API_CONFIG }),
    );
    const remove = renderHook(() => useDeleteKnowledgeSource(), { wrapper }).result;
    await overviewReloadsAfter(() => remove.current.mutateAsync(ID));
  });
});
