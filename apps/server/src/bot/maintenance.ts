import { and, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { botStatus, exchanges } from "../db/schema";
import { getAppSettings } from "../core/settings";
import { logger } from "../logger";

/** Outcome, timings and token counts of exchanges are kept this long. */
const METADATA_DAYS = 365;

/**
 * Removes question and answer texts older than the retention period, deletes
 * exchanges older than a year, and forgets bot processes that stopped.
 */
export async function runMaintenance(db: Db) {
  const { retentionDays } = await getAppSettings(db);
  const textCutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60_000);
  const removed = await db
    .update(exchanges)
    .set({ question: null, answer: null, reason: null, searchQueries: [], textRemovedAt: sql`now()` })
    .where(and(lt(exchanges.createdAt, textCutoff), isNull(exchanges.textRemovedAt)))
    .returning({ id: exchanges.id });
  const deleted = await db
    .delete(exchanges)
    .where(lt(exchanges.createdAt, new Date(Date.now() - METADATA_DAYS * 24 * 60 * 60_000)))
    .returning({ id: exchanges.id });
  await db.delete(botStatus).where(lt(botStatus.lastHeartbeatAt, new Date(Date.now() - 24 * 60 * 60_000)));
  if (removed.length || deleted.length) {
    logger.info({ textsRemoved: removed.length, exchangesDeleted: deleted.length }, "retention cleanup");
  }
}
