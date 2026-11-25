import { z } from "zod";
import { idSchema, nullableText } from "./common";

/**
 * - questions: answers top-level messages it can help with, without a mention.
 * - mentions: answers only when someone mentions the bot.
 */
export const REPLY_MODES = ["questions", "mentions"] as const;
export const replyModeSchema = z.enum(REPLY_MODES);
export type ReplyMode = z.infer<typeof replyModeSchema>;

/**
 * When the knowledge sources hold no answer:
 * - escalate: post the escalation message (e.g. who to ask instead).
 * - silent: say nothing; a person answers.
 */
export const NO_ANSWER_MODES = ["escalate", "silent"] as const;
export const noAnswerModeSchema = z.enum(NO_ANSWER_MODES);
export type NoAnswerMode = z.infer<typeof noAnswerModeSchema>;

/** A Slack channel ID: C… (public), G… (private, older) or D… is not allowed. */
export const slackChannelIdSchema = z
  .string()
  .trim()
  .regex(/^[CG][A-Z0-9]{6,20}$/, "Use a Slack channel ID, e.g. C01ABCDEF");

export const agentChannelSchema = z.object({
  id: slackChannelIdSchema,
  /** Cached channel name for display; null until known. */
  name: z.string().nullable(),
});

export const agentSchema = z.object({
  id: idSchema,
  name: z.string(),
  enabled: z.boolean(),
  /** What the agent does, its tone and its limits. Becomes part of the system prompt. */
  instructions: z.string(),
  providerId: idSchema.nullable(),
  model: z.string(),
  /** Used when the main model fails or refuses. */
  fallbackProviderId: idSchema.nullable(),
  fallbackModel: z.string().nullable(),
  replyMode: replyModeSchema,
  /** Answer replies in threads it already answered, without a mention. */
  followUpsInThreads: z.boolean(),
  noAnswerMode: noAnswerModeSchema,
  /** Posted when no answer is found (noAnswerMode = escalate), e.g. "Please ask @it-team." */
  escalationMessage: z.string(),
  /**
   * When a top-level message only names a topic ("Question about the VPN"),
   * wait for the request in its thread: answer the poster's replies there.
   */
  headlineThreads: z.boolean(),
  /** Posted under such a headline (headlineThreads), e.g. to ask for whole requests; empty posts nothing. */
  headlineMessage: z.string(),
  /** Name and icon in Slack; null uses the Slack app's own. Needs the chat:write.customize scope. */
  displayName: z.string().nullable(),
  iconUrl: z.string().nullable(),
  /** Look at images (screenshots) attached to questions. Needs a model that reads images. */
  readImages: z.boolean(),
  channels: z.array(agentChannelSchema),
  knowledgeSourceIds: z.array(idSchema),
  /** Increases with every change; send it back with an update to detect conflicting edits. */
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Agent = z.infer<typeof agentSchema>;

const modelName = z.string().trim().min(1).max(200);

export const agentInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    enabled: z.boolean(),
    instructions: z.string().trim().max(20_000),
    providerId: idSchema.nullable(),
    model: z.string().trim().max(200),
    fallbackProviderId: idSchema.nullable(),
    fallbackModel: nullableText(200),
    replyMode: replyModeSchema,
    followUpsInThreads: z.boolean(),
    noAnswerMode: noAnswerModeSchema,
    escalationMessage: z.string().trim().max(1000),
    headlineThreads: z.boolean(),
    headlineMessage: z.string().trim().max(1000),
    displayName: nullableText(80),
    iconUrl: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? null : value),
      z
        .url({ protocol: /^https$/ })
        .max(500)
        .nullable(),
    ),
    readImages: z.boolean(),
    channels: z.array(slackChannelIdSchema).max(50),
    knowledgeSourceIds: z.array(idSchema).max(20),
  })
  .superRefine((value, ctx) => {
    if (value.enabled) {
      if (!value.providerId)
        ctx.addIssue({ code: "custom", path: ["providerId"], message: "Choose a provider" });
      if (!modelName.safeParse(value.model).success)
        ctx.addIssue({ code: "custom", path: ["model"], message: "Choose a model" });
      if (value.channels.length === 0)
        ctx.addIssue({ code: "custom", path: ["channels"], message: "Choose at least one channel" });
    }
    if (value.fallbackProviderId && !value.fallbackModel) {
      ctx.addIssue({ code: "custom", path: ["fallbackModel"], message: "Choose a fallback model" });
    }
    if (value.noAnswerMode === "escalate" && value.escalationMessage.trim() === "") {
      ctx.addIssue({
        code: "custom",
        path: ["escalationMessage"],
        message: "Enter what the agent says when it has no answer",
      });
    }
    if (new Set(value.channels).size !== value.channels.length) {
      ctx.addIssue({ code: "custom", path: ["channels"], message: "A channel is listed twice" });
    }
  });
export type AgentInput = z.infer<typeof agentInputSchema>;

/** Updates send the whole agent plus the version they started from (409 on a mismatch). */
export const agentUpdateSchema = z.object({ version: z.number().int() }).and(agentInputSchema);
export type AgentUpdate = z.infer<typeof agentUpdateSchema>;

/** Default instructions for a new agent. */
export const DEFAULT_INSTRUCTIONS = `You are the IT support assistant of our organization in this Slack channel.

Answer questions about our IT tools and accounts, such as passwords, email, laptops, Wi-Fi and software.
Stay silent on messages that are not questions for you: thanks, chat between colleagues, announcements, and requests that a person must carry out (for example "please create an account for …").
Keep answers short: a few sentences or steps.`;

export const DEFAULT_ESCALATION_MESSAGE =
  "I couldn't find an answer to this. Someone from the team will get back to you.";

export const DEFAULT_HEADLINE_MESSAGE =
  "Please write your whole request in one message next time, so I can help right away. For now, I'll read your reply in this thread.";

// ---------------------------------------------------------------------------
// Test console and saved tests
// ---------------------------------------------------------------------------

/** headline: the message only named a topic; the agent waits for the request in its thread. */
export const OUTCOMES = ["pending", "answered", "silent", "headline", "no_answer", "error"] as const;
export const outcomeSchema = z.enum(OUTCOMES);
export type Outcome = z.infer<typeof outcomeSchema>;

export const previewImageSchema = z.object({
  mediaType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
  /** Base64 without a data: prefix; at most about 5 MB. */
  data: z.string().max(7_000_000),
});

export const previewInputSchema = z.object({
  question: z.string().trim().min(1).max(4000),
  /** Earlier messages of the thread, oldest first. */
  thread: z
    .array(z.object({ role: z.enum(["person", "agent"]), text: z.string().max(4000) }))
    .max(20)
    .default([]),
  images: z.array(previewImageSchema).max(3).default([]),
  /** Answer as if the bot was mentioned. */
  mentioned: z.boolean().default(false),
  /** Test unsaved changes: the agent as edited in the form, instead of the saved one. */
  draft: agentInputSchema.optional(),
});
export type PreviewInput = z.input<typeof previewInputSchema>;

export const retrievedSourceSchema = z.object({
  /** Reference the model cites, e.g. "S1". */
  ref: z.string(),
  knowledgeSourceName: z.string(),
  title: z.string(),
  url: z.string().nullable(),
  section: z.string().nullable(),
  text: z.string(),
});
export type RetrievedSource = z.infer<typeof retrievedSourceSchema>;

export const previewResultSchema = z.object({
  outcome: outcomeSchema,
  /** Why the agent answered or stayed silent, in its own words. */
  reason: z.string().nullable(),
  searchQueries: z.array(z.string()),
  sources: z.array(retrievedSourceSchema),
  /** Refs of the sources the answer cites. */
  citedRefs: z.array(z.string()),
  /** The message exactly as it would be posted to Slack (mrkdwn), or null when silent. */
  slackText: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  usedFallback: z.boolean(),
  error: z.string().nullable(),
  timings: z.object({
    triageMs: z.number().int().nullable(),
    searchMs: z.number().int().nullable(),
    answerMs: z.number().int().nullable(),
    totalMs: z.number().int(),
  }),
  usage: z.object({ inputTokens: z.number().int(), outputTokens: z.number().int() }),
});
export type PreviewResult = z.infer<typeof previewResultSchema>;

/** headline: the agent takes the question for a headline and waits for the request. */
export const TEST_EXPECTATIONS = ["answer", "silent", "headline"] as const;
export const testExpectationSchema = z.enum(TEST_EXPECTATIONS);

export const agentTestSchema = z.object({
  id: idSchema,
  agentId: idSchema,
  question: z.string(),
  expectation: testExpectationSchema,
  /** For "answer": the answer must cite this URL (optional). */
  expectedUrl: z.string().nullable(),
  lastRunAt: z.string().nullable(),
  lastPassed: z.boolean().nullable(),
  lastOutcome: outcomeSchema.nullable(),
  lastAnswer: z.string().nullable(),
  /** Why the last run failed, or null. */
  lastFailure: z.string().nullable(),
  createdAt: z.string(),
});
export type AgentTest = z.infer<typeof agentTestSchema>;

export const agentTestInputSchema = z.object({
  question: z.string().trim().min(1).max(4000),
  expectation: testExpectationSchema,
  expectedUrl: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.url().max(1000).nullable(),
  ),
});
export type AgentTestInput = z.infer<typeof agentTestInputSchema>;

export const testRunResultSchema = z.object({
  passed: z.number().int(),
  failed: z.number().int(),
  tests: z.array(agentTestSchema),
});
export type TestRunResult = z.infer<typeof testRunResultSchema>;
