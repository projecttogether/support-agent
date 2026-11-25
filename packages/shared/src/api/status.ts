import { z } from "zod";

export const BOT_STATES = ["connected", "connecting", "disconnected", "not_configured", "unknown"] as const;
export const botStateSchema = z.enum(BOT_STATES);
export type BotState = z.infer<typeof botStateSchema>;

export const statusSchema = z.object({
  /** The commit this installation runs (images of the Deploy workflow), or null. */
  version: z.string().nullable(),
  bot: z.object({
    /** "unknown" when the bot process has not reported for two minutes. */
    state: botStateSchema,
    startedAt: z.string().nullable(),
    lastHeartbeatAt: z.string().nullable(),
    lastEventAt: z.string().nullable(),
    connectedSince: z.string().nullable(),
    version: z.string().nullable(),
  }),
  setup: z.object({
    slack: z.boolean(),
    provider: z.boolean(),
    knowledgeSource: z.boolean(),
    agent: z.boolean(),
  }),
  last24h: z.object({
    messages: z.number().int(),
    answered: z.number().int(),
    silent: z.number().int(),
    noAnswer: z.number().int(),
    errors: z.number().int(),
    helpful: z.number().int(),
    notHelpful: z.number().int(),
  }),
  recentErrors: z.array(z.object({ at: z.string(), agentName: z.string().nullable(), message: z.string() })),
});
export type Status = z.infer<typeof statusSchema>;
