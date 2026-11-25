import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { config } from "../config";
import { SERVER_ROOT } from "../paths";
import { getDb, getPool } from "./client";
import { logger } from "../logger";

export function migrationsFolder(): string {
  return config().MIGRATIONS_DIR ?? path.join(SERVER_ROOT, "drizzle");
}

/** Applies the SQL migrations under an advisory lock, so parallel deploys wait for each other. */
export async function runMigrations() {
  const client = await getPool().connect();
  try {
    await client.query("select pg_advisory_lock(hashtext('support_agent.migrations'))");
    logger.info({ folder: migrationsFolder() }, "applying database migrations");
    await migrate(getDb(), { migrationsFolder: migrationsFolder() });
    logger.info("database migrations applied");
  } finally {
    await client
      .query("select pg_advisory_unlock(hashtext('support_agent.migrations'))")
      .catch(() => undefined);
    client.release();
  }
}
