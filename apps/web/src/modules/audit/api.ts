import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AuditEntry } from "@support-agent/shared/api/users";
import { api } from "@/lib/api";

export function useAudit(limit: number, offset: number) {
  return useQuery({
    queryKey: ["audit", { limit, offset }],
    queryFn: () => api.get<{ items: AuditEntry[]; total: number }>("/audit", { limit, offset }),
    placeholderData: keepPreviousData,
  });
}
