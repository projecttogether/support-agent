import { asc, eq, inArray } from "drizzle-orm";
import type { AgentInput, NoAnswerMode, ReplyMode } from "@support-agent/shared/api/agents";
import type { ProviderKind } from "@support-agent/shared/api/providers";
import type { DbOrTx } from "../db/client";
import { agentChannels, agentKnowledgeSources, agents, knowledgeSources, providers } from "../db/schema";
import { decryptSecret } from "../core/crypto";
import type { ProviderConnection } from "../llm";
import type { SourceConnection } from "../knowledge/search-api";
import type { AgentRuntime, ModelTarget } from "./pipeline";

type ProviderRow = typeof providers.$inferSelect;
type SourceRow = typeof knowledgeSources.$inferSelect;

export function providerConnection(row: ProviderRow): ProviderConnection {
  return {
    kind: row.kind as ProviderKind,
    name: row.name,
    baseUrl: row.baseUrl,
    apiKey: row.apiKeyEncrypted ? decryptSecret(row.apiKeyEncrypted) : null,
  };
}

export function sourceConnection(row: SourceRow): SourceConnection {
  return {
    id: row.id,
    name: row.name,
    config: row.config,
    secret: row.secretEncrypted ? decryptSecret(row.secretEncrypted) : null,
  };
}

type AgentFields = Omit<AgentInput, "channels" | "knowledgeSourceIds">;

function build(
  id: string | null,
  fields: AgentFields,
  channelIds: string[],
  sourceIds: string[],
  providerRows: Map<string, ProviderRow>,
  sourceRows: Map<string, SourceRow>,
): AgentRuntime {
  const target = (providerId: string | null, model: string | null): ModelTarget | null => {
    const row = providerId ? providerRows.get(providerId) : undefined;
    return row && model?.trim() ? { connection: providerConnection(row), model: model.trim() } : null;
  };
  return {
    id,
    name: fields.name,
    enabled: fields.enabled,
    instructions: fields.instructions,
    replyMode: fields.replyMode as ReplyMode,
    followUpsInThreads: fields.followUpsInThreads,
    noAnswerMode: fields.noAnswerMode as NoAnswerMode,
    escalationMessage: fields.escalationMessage,
    headlineThreads: fields.headlineThreads,
    headlineMessage: fields.headlineMessage,
    displayName: fields.displayName,
    iconUrl: fields.iconUrl,
    readImages: fields.readImages,
    channelIds,
    main: target(fields.providerId, fields.model),
    fallback: target(fields.fallbackProviderId, fields.fallbackModel),
    sources: sourceIds.flatMap((sourceId) => {
      const row = sourceRows.get(sourceId);
      return row ? [sourceConnection(row)] : [];
    }),
  };
}

async function lookups(db: DbOrTx, providerIds: string[], sourceIds: string[]) {
  const providerRows = providerIds.length
    ? await db.select().from(providers).where(inArray(providers.id, providerIds))
    : [];
  const sourceRows = sourceIds.length
    ? await db.select().from(knowledgeSources).where(inArray(knowledgeSources.id, sourceIds))
    : [];
  return {
    providerRows: new Map(providerRows.map((row) => [row.id, row])),
    sourceRows: new Map(sourceRows.map((row) => [row.id, row])),
  };
}

/** Every agent with its channels, models and sources (the bot's configuration). */
export async function loadAgentRuntimes(db: DbOrTx, onlyId?: string): Promise<AgentRuntime[]> {
  const rows = onlyId
    ? await db.select().from(agents).where(eq(agents.id, onlyId))
    : await db.select().from(agents).orderBy(asc(agents.name));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const channels = await db.select().from(agentChannels).where(inArray(agentChannels.agentId, ids));
  const links = await db
    .select()
    .from(agentKnowledgeSources)
    .where(inArray(agentKnowledgeSources.agentId, ids))
    .orderBy(asc(agentKnowledgeSources.position));
  const providerIds = [
    ...new Set(
      rows.flatMap((row) => [row.providerId, row.fallbackProviderId]).filter((id): id is string => !!id),
    ),
  ];
  const { providerRows, sourceRows } = await lookups(db, providerIds, [
    ...new Set(links.map((link) => link.knowledgeSourceId)),
  ]);
  return rows.map((row) =>
    build(
      row.id,
      {
        name: row.name,
        enabled: row.enabled,
        instructions: row.instructions,
        providerId: row.providerId,
        model: row.model,
        fallbackProviderId: row.fallbackProviderId,
        fallbackModel: row.fallbackModel,
        replyMode: row.replyMode as ReplyMode,
        followUpsInThreads: row.followUpsInThreads,
        noAnswerMode: row.noAnswerMode as NoAnswerMode,
        escalationMessage: row.escalationMessage,
        headlineThreads: row.headlineThreads,
        headlineMessage: row.headlineMessage,
        displayName: row.displayName,
        iconUrl: row.iconUrl,
        readImages: row.readImages,
      },
      channels.filter((channel) => channel.agentId === row.id).map((channel) => channel.channelId),
      links.filter((link) => link.agentId === row.id).map((link) => link.knowledgeSourceId),
      providerRows,
      sourceRows,
    ),
  );
}

/** An agent as edited in the form (not saved), for the test console. */
export async function runtimeFromInput(
  db: DbOrTx,
  id: string | null,
  input: AgentInput,
): Promise<AgentRuntime> {
  const providerIds = [input.providerId, input.fallbackProviderId].filter(
    (value): value is string => !!value,
  );
  const { providerRows, sourceRows } = await lookups(db, providerIds, input.knowledgeSourceIds);
  const { channels, knowledgeSourceIds, ...fields } = input;
  return build(id, fields, channels, knowledgeSourceIds, providerRows, sourceRows);
}
