import { useQuery } from "@tanstack/react-query";
import type { Status } from "@support-agent/shared/api/status";
import { api } from "@/lib/api";

export const statusQuery = {
  queryKey: ["status"] as const,
  queryFn: () => api.get<Status>("/status"),
};

/** The bot's state, the setup checklist and the counts of the last 24 hours; refreshes every 30 seconds. */
export function useStatus() {
  return useQuery({ ...statusQuery, refetchInterval: 30_000 });
}
