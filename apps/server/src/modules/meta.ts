import { Hono } from "hono";
import { and, count, desc, eq, gt, sql } from "drizzle-orm";
import type { AuthConfig, Me } from "@support-agent/shared/api/users";
import { botStateSchema, type Status } from "@support-agent/shared/api/status";
import { config } from "../config";
import { getDb } from "../db/client";
import { agents, botStatus, exchanges, knowledgeSources, providers } from "../db/schema";
import { getStoredSlack } from "../core/settings";
import type { AppEnv } from "../http/env";
import { requireUser } from "../http/middleware";
import { iso } from "./util";

/** A bot that has not reported for this long counts as unknown. */
const STALE_MS = 2 * 60_000;

const router = new Hono<AppEnv>();

router.get("/auth-config", (c) => {
  const body: AuthConfig = { appName: config().APP_NAME, providerName: config().OIDC_PROVIDER_NAME };
  return c.json(body);
});

router.get("/me", (c) => {
  const principal = requireUser(c);
  const body: Me = {
    id: principal.id,
    email: principal.email,
    name: principal.name || principal.email,
    role: principal.role,
    image: principal.image,
  };
  return c.json(body);
});

router.get("/status", async (c) => {
  requireUser(c);
  const db = getDb();
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  const [[bot], slack, [providerCount], [sourceCount], [agentCount], totals, errors] = await Promise.all([
    db.select().from(botStatus).orderBy(desc(botStatus.lastHeartbeatAt)).limit(1),
    getStoredSlack(db),
    db.select({ value: count() }).from(providers),
    db.select({ value: count() }).from(knowledgeSources),
    db.select({ value: count() }).from(agents).where(eq(agents.enabled, true)),
    db
      .select({
        messages: sql<number>`count(*)::int`,
        answered: sql<number>`count(*) filter (where ${exchanges.outcome} = 'answered')::int`,
        silent: sql<number>`count(*) filter (where ${exchanges.outcome} = 'silent')::int`,
        noAnswer: sql<number>`count(*) filter (where ${exchanges.outcome} = 'no_answer')::int`,
        errors: sql<number>`count(*) filter (where ${exchanges.outcome} = 'error')::int`,
        helpful: sql<number>`count(*) filter (where ${exchanges.feedback} > 0)::int`,
        notHelpful: sql<number>`count(*) filter (where ${exchanges.feedback} < 0)::int`,
      })
      .from(exchanges)
      .where(gt(exchanges.createdAt, since)),
    db
      .select({ at: exchanges.createdAt, agentName: exchanges.agentName, error: exchanges.error })
      .from(exchanges)
      .where(
        and(
          eq(exchanges.outcome, "error"),
          gt(exchanges.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60_000)),
        ),
      )
      .orderBy(desc(exchanges.createdAt))
      .limit(5),
  ]);
  const slackConfigured = Boolean(slack.botTokenEncrypted && slack.appTokenEncrypted);
  let state: Status["bot"]["state"];
  if (!bot) state = slackConfigured ? "unknown" : "not_configured";
  else if (Date.now() - bot.lastHeartbeatAt.getTime() > STALE_MS) state = "unknown";
  else state = botStateSchema.safeParse(bot.state).data ?? "unknown";
  const body: Status = {
    version: config().APP_VERSION ?? null,
    bot: {
      state,
      startedAt: iso(bot?.startedAt),
      lastHeartbeatAt: iso(bot?.lastHeartbeatAt),
      lastEventAt: iso(bot?.lastEventAt),
      connectedSince: iso(bot?.connectedSince),
      version: bot?.version ?? null,
    },
    setup: {
      slack: slackConfigured,
      provider: (providerCount?.value ?? 0) > 0,
      knowledgeSource: (sourceCount?.value ?? 0) > 0,
      agent: (agentCount?.value ?? 0) > 0,
    },
    last24h: totals[0] ?? {
      messages: 0,
      answered: 0,
      silent: 0,
      noAnswer: 0,
      errors: 0,
      helpful: 0,
      notHelpful: 0,
    },
    recentErrors: errors.map((row) => ({
      at: row.at.toISOString(),
      agentName: row.agentName,
      message: row.error ?? "Unknown error",
    })),
  };
  return c.json(body);
});

export default router;
