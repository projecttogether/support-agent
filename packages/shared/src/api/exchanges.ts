import { z } from "zod";
import { idSchema, pageQuerySchema } from "./common";
import { outcomeSchema } from "./agents";

/** One message the bot handled: the question, what it did, and the answer. */
export const exchangeSchema = z.object({
  id: idSchema,
  agentId: idSchema.nullable(),
  agentName: z.string().nullable(),
  channelId: z.string(),
  channelName: z.string().nullable(),
  /** Slack user ID of the person who asked. */
  slackUserId: z.string().nullable(),
  /** Link to the message in Slack, when known. */
  permalink: z.string().nullable(),
  /** Null once the retention period removed the text, or when no text is kept. */
  question: z.string().nullable(),
  answer: z.string().nullable(),
  outcome: outcomeSchema,
  reason: z.string().nullable(),
  sources: z.array(z.object({ title: z.string(), url: z.string().nullable() })),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  usedFallback: z.boolean(),
  error: z.string().nullable(),
  /** Reactions on the answer: 1 helpful (👍), -1 not helpful (👎), 0 none. */
  feedback: z.number().int(),
  latencyMs: z.number().int().nullable(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  createdAt: z.string(),
});
export type Exchange = z.infer<typeof exchangeSchema>;

export const exchangeListQuerySchema = pageQuerySchema.extend({
  agentId: idSchema.optional(),
  outcome: outcomeSchema.optional(),
  feedback: z.enum(["helpful", "not_helpful"]).optional(),
});
export type ExchangeListQuery = z.input<typeof exchangeListQuerySchema>;

export const exchangeListSchema = z.object({ items: z.array(exchangeSchema), total: z.number().int() });
export type ExchangeList = z.infer<typeof exchangeListSchema>;
