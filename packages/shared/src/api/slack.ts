import { z } from "zod";
import { checkResultSchema, nullableText } from "./common";
import { slackChannelIdSchema } from "./agents";

/** Bot token scopes the app needs (the manifest requests them). */
export const REQUIRED_BOT_SCOPES = [
  "channels:history",
  "channels:read",
  "chat:write",
  "groups:history",
  "groups:read",
] as const;

/** Scopes for optional features: images, agent names/icons, the working reaction and feedback. */
export const OPTIONAL_BOT_SCOPES = [
  "files:read",
  "chat:write.customize",
  "reactions:read",
  "reactions:write",
] as const;

export const slackSettingsSchema = z.object({
  hasBotToken: z.boolean(),
  hasAppToken: z.boolean(),
  botTokenHint: z.string().nullable(),
  appTokenHint: z.string().nullable(),
  /** From the last successful check. */
  teamId: z.string().nullable(),
  teamName: z.string().nullable(),
  botUserId: z.string().nullable(),
  botName: z.string().nullable(),
  /** Scopes the bot token lacks, from the last check. */
  missingScopes: z.array(z.string()),
  /** Errors and warnings of the bot go to this channel (optional). */
  alertChannelId: z.string().nullable(),
});
export type SlackSettings = z.infer<typeof slackSettingsSchema>;

/** Omitted fields stay; tokens are write-only. */
export const slackSettingsUpdateSchema = z.object({
  botToken: z
    .string()
    .trim()
    .regex(/^xoxb-[A-Za-z0-9-]+$/, "A bot token starts with xoxb-")
    .optional(),
  appToken: z
    .string()
    .trim()
    .regex(/^xapp-[A-Za-z0-9-]+$/, "An app-level token starts with xapp-")
    .optional(),
  alertChannelId: z
    .preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? null : value),
      slackChannelIdSchema.nullable(),
    )
    .optional(),
});
export type SlackSettingsUpdate = z.infer<typeof slackSettingsUpdateSchema>;

export const slackCheckResultSchema = checkResultSchema.extend({
  teamName: z.string().nullable(),
  botName: z.string().nullable(),
  missingScopes: z.array(z.string()),
  missingOptionalScopes: z.array(z.string()),
});
export type SlackCheckResult = z.infer<typeof slackCheckResultSchema>;

export const slackChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  isPrivate: z.boolean(),
  /** The bot is in the channel; it only receives messages of channels it is in. */
  isMember: z.boolean(),
  /** The agent that already uses this channel, if any. */
  agentId: z.string().nullable(),
});
export const slackChannelsSchema = z.object({
  channels: z.array(slackChannelSchema),
  /** The bot's Slack name from the last connection check, for "/invite @…" hints. */
  botName: z.string().nullable(),
});
export type SlackChannels = z.infer<typeof slackChannelsSchema>;
export type SlackChannel = z.infer<typeof slackChannelSchema>;

export const slackManifestQuerySchema = z.object({ name: nullableText(35).optional() });
export const slackManifestSchema = z.object({ manifest: z.record(z.string(), z.unknown()) });
