import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { getDb } from "../db/client";
import type { AppEnv } from "../http/env";

const router = new Hono<AppEnv>();

/** The process runs. */
router.get("/-/livez", (c) => c.json({ ok: true }));

/** The process can serve requests: the database answers. */
router.get("/-/readyz", async (c) => {
  try {
    await getDb().execute(sql`select 1`);
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false }, 503);
  }
});

export default router;
