import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  SlackChannel,
  SlackChannels,
  SlackCheckResult,
  SlackSettings,
  SlackSettingsUpdate,
} from "@support-agent/shared/api/slack";
import { api, ApiError } from "@/lib/api";

export const slackKeys = {
  all: ["slack"] as const,
  settings: ["slack", "settings"] as const,
  channels: ["slack", "channels"] as const,
  manifest: (name: string) => ["slack", "manifest", name] as const,
};

/** Admins only. */
export function useSlackSettings(enabled = true) {
  return useQuery({
    queryKey: slackKeys.settings,
    queryFn: () => api.get<SlackSettings>("/slack"),
    enabled,
  });
}

/** Channels the bot can see. Fails with 409 `slack_not_configured` before Slack is set up. */
const channelsQuery = {
  queryKey: slackKeys.channels,
  queryFn: () => api.get<SlackChannels>("/slack/channels"),
  staleTime: 60_000,
  retry: false,
} as const;

export function useSlackChannels() {
  return useQuery({ ...channelsQuery, select: (data: SlackChannels): SlackChannel[] => data.channels });
}

/** The bot's Slack name, also for editors (from the channel list). */
export function useSlackBotName() {
  return useQuery({ ...channelsQuery, select: (data: SlackChannels) => data.botName });
}

export function isSlackNotConfigured(error: unknown): boolean {
  return error instanceof ApiError && error.code === "slack_not_configured";
}

export function useSlackManifest(name: string) {
  return useQuery({
    queryKey: slackKeys.manifest(name),
    queryFn: () =>
      api
        .get<{ manifest: Record<string, unknown> }>("/slack/manifest", { name })
        .then((data) => data.manifest),
    staleTime: Infinity,
    placeholderData: (previous) => previous,
  });
}

export function useUpdateSlack() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SlackSettingsUpdate) => api.patch<SlackSettings>("/slack", input),
    onSuccess: (settings) => {
      client.setQueryData(slackKeys.settings, settings);
      return Promise.all([
        client.invalidateQueries({ queryKey: slackKeys.all }),
        client.invalidateQueries({ queryKey: ["status"] }),
      ]);
    },
  });
}

export function useCheckSlack() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<SlackCheckResult>("/slack/check"),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: slackKeys.all }),
        client.invalidateQueries({ queryKey: ["status"] }),
      ]),
  });
}
