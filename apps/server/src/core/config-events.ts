import { sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client";

/** The Postgres channel the bot listens on to reload its configuration. */
export const CONFIG_CHANNEL = "support_agent_config";

/**
 * Tells running bot processes that agents, providers, knowledge sources or
 * Slack settings changed. Inside a transaction, Postgres delivers it on commit.
 */
export async function notifyConfigChanged(db: DbOrTx) {
  await db.execute(sql`select pg_notify(${CONFIG_CHANNEL}, '')`);
}
