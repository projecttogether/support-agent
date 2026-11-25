import { sql } from "drizzle-orm";
import type { Role } from "@support-agent/shared/roles";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { createApp } from "../http/app";

/** Empties every table between tests. */
export async function resetDatabase() {
  await getDb().execute(sql`
    truncate table audit_log, agent_tests, exchanges, agent_knowledge_sources, agent_channels, agents,
      knowledge_sources, providers, settings, bot_status, sessions, accounts, verifications, auth_rate_limits, users
      restart identity cascade
  `);
}

export async function createUser(
  role: Role,
  email = `${role}-${Math.random().toString(36).slice(2, 8)}@example.org`,
) {
  const [user] = await getDb().insert(users).values({ email, name: role, role, isActive: true }).returning();
  return user!;
}

let app: ReturnType<typeof createApp> | undefined;

/**
 * A request to the app as `userId` (the test resolver in api tests reads the
 * x-test-user header). JSON bodies are sent with the app's origin.
 */
export async function request(
  method: string,
  path: string,
  options: { userId?: string; body?: unknown } = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test responses are read loosely
): Promise<{ status: number; body: any }> {
  app ??= createApp();
  const headers: Record<string, string> = { origin: "http://localhost:3000", accept: "application/json" };
  if (options.userId) headers["x-test-user"] = options.userId;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await app.request(path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
