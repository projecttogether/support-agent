import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { DEFAULT_HEADLINE_MESSAGE } from "@support-agent/shared/api/agents";
import type { SearchApiConfig } from "@support-agent/shared/api/knowledge";
import { users } from "./auth";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** A model provider with its (encrypted) API key. */
export const providers = pgTable("providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** ProviderKind */
  kind: text("kind").notNull(),
  baseUrl: text("base_url"),
  apiKeyEncrypted: text("api_key_encrypted"),
  apiKeyHint: text("api_key_hint"),
  ...timestamps,
});

/** Where agents search for answers; the secret is a bearer token or OAuth client secret. */
export const knowledgeSources = pgTable("knowledge_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  kind: text("kind").notNull(),
  config: jsonb("config").$type<SearchApiConfig>().notNull(),
  secretEncrypted: text("secret_encrypted"),
  ...timestamps,
});

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  instructions: text("instructions").notNull().default(""),
  providerId: uuid("provider_id").references(() => providers.id, { onDelete: "restrict" }),
  model: text("model").notNull().default(""),
  fallbackProviderId: uuid("fallback_provider_id").references(() => providers.id, {
    onDelete: "restrict",
  }),
  fallbackModel: text("fallback_model"),
  /** ReplyMode */
  replyMode: text("reply_mode").notNull().default("questions"),
  followUpsInThreads: boolean("follow_ups_in_threads").notNull().default(false),
  /** NoAnswerMode */
  noAnswerMode: text("no_answer_mode").notNull().default("escalate"),
  escalationMessage: text("escalation_message").notNull().default(""),
  headlineThreads: boolean("headline_threads").notNull().default(false),
  headlineMessage: text("headline_message").notNull().default(DEFAULT_HEADLINE_MESSAGE),
  displayName: text("display_name"),
  iconUrl: text("icon_url"),
  readImages: boolean("read_images").notNull().default(true),
  version: integer("version").notNull().default(1),
  ...timestamps,
});

/** Each Slack channel belongs to at most one agent. */
export const agentChannels = pgTable(
  "agent_channels",
  {
    channelId: text("channel_id").primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    channelName: text("channel_name"),
  },
  (table) => [index("idx_agent_channels_agent").on(table.agentId)],
);

export const agentKnowledgeSources = pgTable(
  "agent_knowledge_sources",
  {
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    knowledgeSourceId: uuid("knowledge_source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "restrict" }),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.knowledgeSourceId] }),
    index("idx_agent_knowledge_sources_source").on(table.knowledgeSourceId),
  ],
);

/** Saved test questions of an agent and their last result. */
export const agentTests = pgTable(
  "agent_tests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    /** answer | silent */
    expectation: text("expectation").notNull(),
    expectedUrl: text("expected_url"),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastPassed: boolean("last_passed"),
    lastOutcome: text("last_outcome"),
    lastAnswer: text("last_answer"),
    lastFailure: text("last_failure"),
    ...timestamps,
  },
  (table) => [index("idx_agent_tests_agent").on(table.agentId)],
);

/**
 * One Slack message an agent handled. Only messages the agent considered are
 * recorded (not every channel message). The texts are removed after the
 * retention period; outcome, timings and token counts stay.
 */
export const exchanges = pgTable(
  "exchanges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    agentName: text("agent_name"),
    channelId: text("channel_id").notNull(),
    channelName: text("channel_name"),
    slackUserId: text("slack_user_id"),
    messageTs: text("message_ts").notNull(),
    threadTs: text("thread_ts"),
    /** ts of the bot's reply, to match feedback reactions. */
    answerTs: text("answer_ts"),
    question: text("question"),
    answer: text("answer"),
    /** Outcome */
    outcome: text("outcome").notNull().default("pending"),
    reason: text("reason"),
    searchQueries: jsonb("search_queries").$type<string[]>().notNull().default([]),
    sources: jsonb("sources").$type<{ title: string; url: string | null }[]>().notNull().default([]),
    provider: text("provider"),
    model: text("model"),
    usedFallback: boolean("used_fallback").notNull().default(false),
    error: text("error"),
    feedback: integer("feedback").notNull().default(0),
    latencyMs: integer("latency_ms"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    textRemovedAt: timestamp("text_removed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_exchanges_message").on(table.channelId, table.messageTs),
    index("idx_exchanges_created").on(table.createdAt),
    index("idx_exchanges_agent").on(table.agentId, table.createdAt),
    index("idx_exchanges_thread").on(table.channelId, table.threadTs),
    index("idx_exchanges_answer").on(table.channelId, table.answerTs),
  ],
);

/** Key-value settings: `app` (AppSettings) and `slack` (tokens and workspace details). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** What the bot process last reported (one row per running bot process). */
export const botStatus = pgTable("bot_status", {
  instanceId: text("instance_id").primaryKey(),
  /** BotState */
  state: text("state").notNull(),
  version: text("version"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  connectedSince: timestamp("connected_since", { withTimezone: true }),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).notNull(),
  lastEventAt: timestamp("last_event_at", { withTimezone: true }),
});

/** Changes made in the admin interface. Never stores secrets. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_audit_log_created").on(table.createdAt)],
);
