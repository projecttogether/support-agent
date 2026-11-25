import { sql } from "drizzle-orm";
import { config } from "../config";
import type { Db } from "../db/client";
import { users } from "../db/schema";
import { logger } from "../logger";

/**
 * Makes every address in ADMIN_EMAILS an active admin, so the first person
 * can sign in and an installation can always be recovered.
 */
export async function ensureEnvironmentAdmins(db: Db) {
  for (const email of config().adminEmails) {
    await db
      .insert(users)
      .values({ email, name: "", role: "admin", isActive: true })
      .onConflictDoUpdate({
        target: users.email,
        set: { role: "admin", isActive: true, updatedAt: sql`now()` },
      });
  }
  if (config().adminEmails.length > 0)
    logger.info({ count: config().adminEmails.length }, "admins from ADMIN_EMAILS ensured");
}

export function isEnvironmentAdmin(email: string): boolean {
  return config().adminEmails.includes(email.toLowerCase());
}
