import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  appSettingsSchema,
  DEFAULT_APP_SETTINGS,
  type AppSettings,
} from "@support-agent/shared/api/settings";
import type { DbOrTx } from "../db/client";
import { settings } from "../db/schema";

export async function getAppSettings(db: DbOrTx): Promise<AppSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "app"));
  const parsed = appSettingsSchema.safeParse({ ...DEFAULT_APP_SETTINGS, ...(row?.value ?? {}) });
  return parsed.success ? parsed.data : DEFAULT_APP_SETTINGS;
}

export async function putSetting(db: DbOrTx, key: string, value: Record<string, unknown>) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: sql`now()` } });
}

/** The Slack connection as stored: tokens encrypted, plus what the last check found. */
export const storedSlackSchema = z.object({
  botTokenEncrypted: z.string().nullable().default(null),
  botTokenHint: z.string().nullable().default(null),
  appTokenEncrypted: z.string().nullable().default(null),
  appTokenHint: z.string().nullable().default(null),
  teamId: z.string().nullable().default(null),
  teamName: z.string().nullable().default(null),
  /** e.g. https://example.slack.com/ (for message links). */
  teamUrl: z.string().nullable().default(null),
  botUserId: z.string().nullable().default(null),
  botName: z.string().nullable().default(null),
  missingScopes: z.array(z.string()).default([]),
  alertChannelId: z.string().nullable().default(null),
});
export type StoredSlack = z.infer<typeof storedSlackSchema>;

export async function getStoredSlack(db: DbOrTx): Promise<StoredSlack> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "slack"));
  const parsed = storedSlackSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : storedSlackSchema.parse({});
}

export async function putStoredSlack(db: DbOrTx, value: StoredSlack) {
  await putSetting(db, "slack", value);
}
