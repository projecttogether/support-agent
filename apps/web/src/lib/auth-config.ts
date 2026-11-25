import { useQuery } from "@tanstack/react-query";
import type { AuthConfig } from "@support-agent/shared/api/users";
import { api } from "./api";

/** The app's name when the installation sets none (APP_NAME). */
export const DEFAULT_APP_NAME = "Support Agent";

export const authConfigQuery = {
  queryKey: ["auth-config"] as const,
  queryFn: () => api.get<AuthConfig>("/auth-config"),
  staleTime: 5 * 60_000,
};

/** The app name and sign-in provider (public). */
export function useAuthConfig() {
  return useQuery(authConfigQuery).data;
}
