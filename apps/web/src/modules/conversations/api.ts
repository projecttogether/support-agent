import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Outcome } from "@support-agent/shared/api/agents";
import type { Exchange, ExchangeList } from "@support-agent/shared/api/exchanges";
import { api } from "@/lib/api";

export type ExchangeFilters = {
  agentId?: string;
  outcome?: Outcome;
  feedback?: "helpful" | "not_helpful";
  limit: number;
  offset: number;
};

export function useExchanges(query: ExchangeFilters) {
  return useQuery({
    queryKey: ["exchanges", "list", query],
    queryFn: () => api.get<ExchangeList>("/exchanges", query),
    placeholderData: keepPreviousData,
  });
}

export function useExchange(id: string | undefined) {
  return useQuery({
    queryKey: ["exchanges", "detail", id],
    queryFn: () => api.get<Exchange>(`/exchanges/${id}`),
    enabled: Boolean(id),
  });
}
