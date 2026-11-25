import { Hono } from "hono";
import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { exchangeListQuerySchema, type Exchange } from "@support-agent/shared/api/exchanges";
import type { Outcome } from "@support-agent/shared/api/agents";
import { getDb } from "../db/client";
import { exchanges } from "../db/schema";
import type { AppEnv } from "../http/env";
import { notFound } from "../http/errors";
import { idParam, queryOf, requireUser } from "../http/middleware";
import { permalink, teamUrl } from "./slack";
import { isoRequired } from "./util";

type Row = typeof exchanges.$inferSelect;

function toExchange(row: Row, workspaceUrl: string | null): Exchange {
  return {
    id: row.id,
    agentId: row.agentId,
    agentName: row.agentName,
    channelId: row.channelId,
    channelName: row.channelName,
    slackUserId: row.slackUserId,
    permalink: permalink(workspaceUrl, row.channelId, row.messageTs, row.threadTs),
    question: row.question,
    answer: row.answer,
    outcome: row.outcome as Outcome,
    reason: row.reason,
    sources: row.sources,
    provider: row.provider,
    model: row.model,
    usedFallback: row.usedFallback,
    error: row.error,
    feedback: row.feedback,
    latencyMs: row.latencyMs,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    createdAt: isoRequired(row.createdAt),
  };
}

const router = new Hono<AppEnv>();

router.get("/exchanges", async (c) => {
  requireUser(c);
  const query = queryOf(c, exchangeListQuerySchema);
  const conditions: SQL[] = [];
  if (query.agentId) conditions.push(eq(exchanges.agentId, query.agentId));
  if (query.outcome) conditions.push(eq(exchanges.outcome, query.outcome));
  if (query.feedback) conditions.push(eq(exchanges.feedback, query.feedback === "helpful" ? 1 : -1));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();
  const [rows, [total], workspaceUrl] = await Promise.all([
    db
      .select()
      .from(exchanges)
      .where(where)
      .orderBy(desc(exchanges.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ value: count() }).from(exchanges).where(where),
    teamUrl(),
  ]);
  return c.json({ items: rows.map((row) => toExchange(row, workspaceUrl)), total: total?.value ?? 0 });
});

router.get("/exchanges/:id", async (c) => {
  requireUser(c);
  const [row] = await getDb()
    .select()
    .from(exchanges)
    .where(eq(exchanges.id, idParam(c)));
  if (!row) throw notFound("Conversation not found");
  return c.json(toExchange(row, await teamUrl()));
});

export default router;
