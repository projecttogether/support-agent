import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppSettings } from "@support-agent/shared/api/settings";
import { api } from "@/lib/api";

export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => api.get<AppSettings>("/settings") });
}

export function useSaveSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AppSettings) => api.put<AppSettings>("/settings", input),
    onSuccess: (settings) => {
      client.setQueryData(["settings"], settings);
      return client.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}
