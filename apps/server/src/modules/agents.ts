import { Hono } from "hono";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import {
  agentInputSchema,
  agentTestInputSchema,
  agentUpdateSchema,
  previewInputSchema,
  type Agent,
  type AgentInput,
  type AgentTest,
  type AgentUpdate,
  type NoAnswerMode,
  type Outcome,
  type PreviewResult,
  type ReplyMode,
} from "@support-agent/shared/api/agents";
import { getDb, type DbOrTx, type Tx } from "../db/client";
import {
  agentChannels,
  agentKnowledgeSources,
  agents,
  agentTests,
  knowledgeSources,
  providers,
} from "../db/schema";
import { audit } from "../core/audit";
import { notifyConfigChanged } from "../core/config-events";
import { getAppSettings } from "../core/settings";
import type { Actor } from "../auth/principal";
import type { AppEnv } from "../http/env";
import { AppError, conflict, notFound, validationError } from "../http/errors";
import { idParam, jsonBody, requireUser } from "../http/middleware";
import { loadAgentRuntimes, runtimeFromInput } from "../agent/runtime";
import { runPipeline, type AgentRuntime, type PipelineResult } from "../agent/pipeline";
import { replyFor } from "../agent/reply";
import { channelNames } from "../slack/web";
import { isoRequired, iso } from "./util";

type Row = typeof agents.$inferSelect;

async function toAgents(db: DbOrTx, rows: Row[]): Promise<Agent[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [channels, links] = await Promise.all([
    db
      .select()
      .from(agentChannels)
      .where(inArray(agentChannels.agentId, ids))
      .orderBy(asc(agentChannels.channelId)),
    db
      .select()
      .from(agentKnowledgeSources)
      .where(inArray(agentKnowledgeSources.agentId, ids))
      .orderBy(asc(agentKnowledgeSources.position)),
  ]);
  return rows.map((row) => ({
    id: row.id,
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
    channels: channels
      .filter((channel) => channel.agentId === row.id)
      .map((channel) => ({ id: channel.channelId, name: channel.channelName })),
    knowledgeSourceIds: links.filter((link) => link.agentId === row.id).map((link) => link.knowledgeSourceId),
    version: row.version,
    createdAt: isoRequired(row.createdAt),
    updatedAt: isoRequired(row.updatedAt),
  }));
}

export async function loadAgent(db: DbOrTx, id: string): Promise<Agent> {
  const rows = await db.select().from(agents).where(eq(agents.id, id));
  const [agent] = await toAgents(db, rows);
  if (!agent) throw notFound("Agent not found");
  return agent;
}

/** Checks references and that no other agent uses the channels. */
async function checkReferences(tx: Tx, input: AgentInput, agentId: string | null) {
  const providerIds = [input.providerId, input.fallbackProviderId].filter(
    (value): value is string => !!value,
  );
  if (providerIds.length > 0) {
    const found = await tx
      .select({ id: providers.id })
      .from(providers)
      .where(inArray(providers.id, providerIds));
    const known = new Set(found.map((row) => row.id));
    if (input.providerId && !known.has(input.providerId))
      throw validationError({ providerId: "This provider no longer exists" });
    if (input.fallbackProviderId && !known.has(input.fallbackProviderId))
      throw validationError({ fallbackProviderId: "This provider no longer exists" });
  }
  if (input.knowledgeSourceIds.length > 0) {
    const found = await tx
      .select({ id: knowledgeSources.id })
      .from(knowledgeSources)
      .where(inArray(knowledgeSources.id, input.knowledgeSourceIds));
    if (found.length !== new Set(input.knowledgeSourceIds).size)
      throw validationError({ knowledgeSourceIds: "A knowledge source no longer exists" });
  }
  if (input.channels.length > 0) {
    const taken = await tx
      .select({ channelId: agentChannels.channelId, agentName: agents.name })
      .from(agentChannels)
      .innerJoin(agents, eq(agents.id, agentChannels.agentId))
      .where(
        agentId
          ? and(inArray(agentChannels.channelId, input.channels), ne(agentChannels.agentId, agentId))
          : inArray(agentChannels.channelId, input.channels),
      )
      .limit(1);
    if (taken[0]) {
      throw validationError({
        channels: `The agent "${taken[0].agentName}" already uses channel ${taken[0].channelId}`,
      });
    }
  }
}

/**
 * Display names of the channels: the stored ones, the others from Slack.
 * Runs before the transaction, so that a slow Slack does not hold it open.
 */
async function lookUpChannelNames(db: DbOrTx, channels: string[]): Promise<Map<string, string>> {
  if (channels.length === 0) return new Map();
  const stored = await db
    .select({ channelId: agentChannels.channelId, channelName: agentChannels.channelName })
    .from(agentChannels)
    .where(inArray(agentChannels.channelId, channels));
  const names = new Map<string, string>();
  for (const row of stored) if (row.channelName) names.set(row.channelId, row.channelName);
  const missing = channels.filter((id) => !names.has(id));
  if (missing.length > 0) for (const [id, name] of await channelNames(missing)) names.set(id, name);
  return names;
}

async function writeLinks(tx: Tx, agentId: string, input: AgentInput, names: Map<string, string>) {
  await tx.delete(agentChannels).where(eq(agentChannels.agentId, agentId));
  if (input.channels.length > 0) {
    await tx.insert(agentChannels).values(
      input.channels.map((channelId) => ({
        channelId,
        agentId,
        channelName: names.get(channelId) ?? null,
      })),
    );
  }
  await tx.delete(agentKnowledgeSources).where(eq(agentKnowledgeSources.agentId, agentId));
  if (input.knowledgeSourceIds.length > 0) {
    await tx.insert(agentKnowledgeSources).values(
      input.knowledgeSourceIds.map((knowledgeSourceId, position) => ({
        agentId,
        knowledgeSourceId,
        position,
      })),
    );
  }
}

function columns(input: AgentInput) {
  return {
    name: input.name,
    enabled: input.enabled,
    instructions: input.instructions,
    providerId: input.providerId,
    model: input.model,
    fallbackProviderId: input.fallbackProviderId,
    fallbackModel: input.fallbackProviderId ? input.fallbackModel : null,
    replyMode: input.replyMode,
    followUpsInThreads: input.followUpsInThreads,
    noAnswerMode: input.noAnswerMode,
    escalationMessage: input.escalationMessage,
    headlineThreads: input.headlineThreads,
    headlineMessage: input.headlineMessage,
    displayName: input.displayName,
    iconUrl: input.iconUrl,
    readImages: input.readImages,
  };
}

// ---------------------------------------------------------------------------
// Service: the agent page's routes and `cli settings … agents` call these.
// ---------------------------------------------------------------------------

export async function listAgents(): Promise<Agent[]> {
  const db = getDb();
  const rows = await db.select().from(agents).orderBy(asc(agents.name));
  return toAgents(db, rows);
}

export async function createAgent(actor: Actor, input: AgentInput): Promise<Agent> {
  const db = getDb();
  const names = await lookUpChannelNames(db, input.channels);
  const id = await db.transaction(async (tx) => {
    await checkReferences(tx, input, null);
    const [created] = await tx.insert(agents).values(columns(input)).returning({ id: agents.id });
    await writeLinks(tx, created!.id, input, names);
    await audit(tx, actor, {
      action: "agent.created",
      entityType: "agent",
      entityId: created!.id,
      summary: `Created agent "${input.name}"`,
    });
    await notifyConfigChanged(tx);
    return created!.id;
  });
  return loadAgent(db, id);
}

/** Saves the agent page; `input.version` must be the version it was read at. */
export async function updateAgent(actor: Actor, id: string, input: AgentUpdate): Promise<Agent> {
  const db = getDb();
  const names = await lookUpChannelNames(db, input.channels);
  await db.transaction(async (tx) => {
    // The row lock makes simultaneous saves of the same version wait here and
    // then see the new version, so only the first one goes through.
    const [current] = await tx
      .select({ version: agents.version })
      .from(agents)
      .where(eq(agents.id, id))
      .for("update");
    if (!current) throw notFound("Agent not found");
    if (current.version !== input.version) {
      throw conflict("Someone else changed this agent. Reload to see the changes.", "version_conflict");
    }
    await checkReferences(tx, input, id);
    await tx
      .update(agents)
      .set({ ...columns(input), version: current.version + 1, updatedAt: new Date() })
      .where(eq(agents.id, id));
    await writeLinks(tx, id, input, names);
    await audit(tx, actor, {
      action: "agent.updated",
      entityType: "agent",
      entityId: id,
      summary: `Changed agent "${input.name}"`,
    });
    await notifyConfigChanged(tx);
  });
  return loadAgent(db, id);
}

export async function deleteAgent(actor: Actor, id: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [current] = await tx.select({ name: agents.name }).from(agents).where(eq(agents.id, id));
    if (!current) throw notFound("Agent not found");
    await tx.delete(agents).where(eq(agents.id, id));
    await audit(tx, actor, {
      action: "agent.deleted",
      entityType: "agent",
      entityId: id,
      summary: `Deleted agent "${current.name}"`,
    });
    await notifyConfigChanged(tx);
  });
}

// ---------------------------------------------------------------------------
// Test console and saved tests
// ---------------------------------------------------------------------------

async function runtimeFor(
  db: DbOrTx,
  id: string | null,
  draft: AgentInput | undefined,
): Promise<AgentRuntime> {
  if (draft) return runtimeFromInput(db, id, draft);
  if (!id) throw validationError({ draft: "Send the agent to test" });
  const [runtime] = await loadAgentRuntimes(db, id);
  if (!runtime) throw notFound("Agent not found");
  return runtime;
}

function requireModel(runtime: AgentRuntime) {
  if (!runtime.main && !runtime.fallback) {
    throw new AppError(409, "no_model", "Choose a provider and a model for this agent first");
  }
}

async function preview(db: DbOrTx, id: string | null, body: unknown): Promise<PreviewResult> {
  const input = previewInputSchema.parse(body);
  const runtime = await runtimeFor(db, id, input.draft);
  requireModel(runtime);
  const result = await runPipeline({
    agent: runtime,
    question: input.question,
    thread: input.thread,
    images: input.images,
    mentioned: input.mentioned,
  });
  // Settings only matter for an error, as before; a successful preview needs no further read.
  const errorMessage = result.outcome === "error" ? (await getAppSettings(db)).errorMessage : null;
  const reply = replyFor(result, runtime, errorMessage);
  return {
    outcome: result.outcome,
    reason: result.reason,
    searchQueries: result.searchQueries,
    sources: result.sources,
    citedRefs: result.citedRefs,
    slackText: reply?.text ?? null,
    provider: result.provider,
    model: result.model,
    usedFallback: result.usedFallback,
    error: result.error,
    timings: result.timings,
    usage: result.usage,
  };
}

function toTest(row: typeof agentTests.$inferSelect): AgentTest {
  return {
    id: row.id,
    agentId: row.agentId,
    question: row.question,
    expectation: row.expectation as AgentTest["expectation"],
    expectedUrl: row.expectedUrl,
    lastRunAt: iso(row.lastRunAt),
    lastPassed: row.lastPassed,
    lastOutcome: row.lastOutcome as Outcome | null,
    lastAnswer: row.lastAnswer,
    lastFailure: row.lastFailure,
    createdAt: isoRequired(row.createdAt),
  };
}

const sameUrl = (a: string, b: string) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

/** Whether a run meets the test's expectation, and why not. */
export function judge(
  test: { expectation: string; expectedUrl: string | null },
  result: Pick<PipelineResult, "outcome" | "reason" | "error" | "sources" | "citedRefs"> & {
    /** What the agent would post, or null. */
    slackText: string | null;
  },
): { passed: boolean; failure: string | null } {
  if (result.outcome === "error") return { passed: false, failure: `Error: ${result.error ?? "unknown"}` };
  if (test.expectation === "silent") {
    if (result.slackText === null) return { passed: true, failure: null };
    const failures: Partial<Record<PipelineResult["outcome"], string>> = {
      answered: "The agent answered",
      headline: "The agent posted its headline message",
    };
    return { passed: false, failure: failures[result.outcome] ?? "The agent posted its no-answer message" };
  }
  if (test.expectation === "headline") {
    if (result.outcome === "headline") return { passed: true, failure: null };
    return {
      passed: false,
      failure: `The agent didn't take the message for a headline: ${result.reason ?? "no reason given"}`,
    };
  }
  if (result.outcome === "silent")
    return { passed: false, failure: `The agent stayed silent: ${result.reason ?? "no reason given"}` };
  if (result.outcome === "headline")
    return { passed: false, failure: "The agent took the message for a headline and waits for the request" };
  if (result.outcome === "no_answer") return { passed: false, failure: "The agent found no answer" };
  if (test.expectedUrl) {
    const cited = result.sources.filter((source) => result.citedRefs.includes(source.ref) && source.url);
    if (!cited.some((source) => sameUrl(source.url!, test.expectedUrl!))) {
      return { passed: false, failure: `The answer did not cite ${test.expectedUrl}` };
    }
  }
  return { passed: true, failure: null };
}

async function runTest(
  db: DbOrTx,
  runtime: AgentRuntime,
  row: typeof agentTests.$inferSelect,
): Promise<AgentTest> {
  const result = await runPipeline({
    agent: runtime,
    question: row.question,
    thread: [],
    images: [],
    mentioned: false,
  });
  // Saved tests keep errors without text, unlike the test console.
  const slackText = replyFor(result, runtime, null)?.text ?? null;
  const verdict = judge(row, { ...result, slackText });
  const [updated] = await db
    .update(agentTests)
    .set({
      lastRunAt: new Date(),
      lastPassed: verdict.passed,
      lastOutcome: result.outcome,
      lastAnswer: slackText,
      lastFailure: verdict.failure,
      updatedAt: new Date(),
    })
    .where(eq(agentTests.id, row.id))
    .returning();
  return toTest(updated!);
}

async function loadTest(db: DbOrTx, agentId: string, testId: string) {
  const [row] = await db
    .select()
    .from(agentTests)
    .where(and(eq(agentTests.id, testId), eq(agentTests.agentId, agentId)));
  if (!row) throw notFound("Test not found");
  return row;
}

// ---------------------------------------------------------------------------
// Routes (editors and admins)
// ---------------------------------------------------------------------------

const router = new Hono<AppEnv>();

router.get("/agents", async (c) => {
  requireUser(c);
  return c.json({ items: await listAgents() });
});

router.post("/agents", async (c) => {
  const actor = requireUser(c);
  const input = await jsonBody(c, agentInputSchema);
  return c.json(await createAgent(actor, input), 201);
});

router.post("/agents/preview", async (c) => {
  requireUser(c);
  return c.json(await preview(getDb(), null, await c.req.json().catch(() => ({}))));
});

router.get("/agents/:id", async (c) => {
  requireUser(c);
  return c.json(await loadAgent(getDb(), idParam(c)));
});

router.put("/agents/:id", async (c) => {
  const actor = requireUser(c);
  const id = idParam(c);
  const input = await jsonBody(c, agentUpdateSchema);
  return c.json(await updateAgent(actor, id, input));
});

router.delete("/agents/:id", async (c) => {
  const actor = requireUser(c);
  await deleteAgent(actor, idParam(c));
  return c.json({ ok: true });
});

router.post("/agents/:id/preview", async (c) => {
  requireUser(c);
  const id = idParam(c);
  const db = getDb();
  await loadAgent(db, id);
  return c.json(await preview(db, id, await c.req.json().catch(() => ({}))));
});

router.get("/agents/:id/tests", async (c) => {
  requireUser(c);
  const id = idParam(c);
  const rows = await getDb()
    .select()
    .from(agentTests)
    .where(eq(agentTests.agentId, id))
    .orderBy(asc(agentTests.createdAt));
  return c.json({ items: rows.map(toTest) });
});

router.post("/agents/:id/tests", async (c) => {
  requireUser(c);
  const id = idParam(c);
  const input = await jsonBody(c, agentTestInputSchema);
  const db = getDb();
  await loadAgent(db, id);
  const [row] = await db
    .insert(agentTests)
    .values({
      agentId: id,
      question: input.question,
      expectation: input.expectation,
      expectedUrl: input.expectedUrl,
    })
    .returning();
  return c.json(toTest(row!), 201);
});

router.put("/agents/:id/tests/:testId", async (c) => {
  requireUser(c);
  const id = idParam(c);
  const testId = idParam(c, "testId");
  const input = await jsonBody(c, agentTestInputSchema);
  const db = getDb();
  await loadTest(db, id, testId);
  const [row] = await db
    .update(agentTests)
    .set({
      question: input.question,
      expectation: input.expectation,
      expectedUrl: input.expectedUrl,
      lastRunAt: null,
      lastPassed: null,
      lastOutcome: null,
      lastAnswer: null,
      lastFailure: null,
      updatedAt: new Date(),
    })
    .where(eq(agentTests.id, testId))
    .returning();
  return c.json(toTest(row!));
});

router.delete("/agents/:id/tests/:testId", async (c) => {
  requireUser(c);
  const id = idParam(c);
  const testId = idParam(c, "testId");
  const db = getDb();
  await loadTest(db, id, testId);
  await db.delete(agentTests).where(eq(agentTests.id, testId));
  return c.json({ ok: true });
});

/** Runs one saved test against the saved agent (the web app runs them one by one to show progress). */
router.post("/agents/:id/tests/:testId/run", async (c) => {
  requireUser(c);
  const id = idParam(c);
  const testId = idParam(c, "testId");
  const db = getDb();
  const row = await loadTest(db, id, testId);
  const runtime = await runtimeFor(db, id, undefined);
  requireModel(runtime);
  return c.json(await runTest(db, runtime, row));
});

/** Runs every saved test, four at a time. */
router.post("/agents/:id/tests/run", async (c) => {
  requireUser(c);
  const id = idParam(c);
  const db = getDb();
  const runtime = await runtimeFor(db, id, undefined);
  requireModel(runtime);
  const rows = await db
    .select()
    .from(agentTests)
    .where(eq(agentTests.agentId, id))
    .orderBy(asc(agentTests.createdAt));
  const results: AgentTest[] = new Array(rows.length);
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const index = next++;
      results[index] = await runTest(db, runtime, rows[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, worker));
  const passed = results.filter((test) => test.lastPassed).length;
  return c.json({ passed, failed: results.length - passed, tests: results });
});

export default router;
