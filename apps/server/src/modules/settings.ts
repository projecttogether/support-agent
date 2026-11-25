import { Hono } from "hono";
import { appSettingsSchema, type AppSettings } from "@support-agent/shared/api/settings";
import { getDb } from "../db/client";
import { audit } from "../core/audit";
import { notifyConfigChanged } from "../core/config-events";
import { getAppSettings, putSetting } from "../core/settings";
import type { Actor } from "../auth/principal";
import type { AppEnv } from "../http/env";
import { jsonBody, requireAdmin, requireUser } from "../http/middleware";

export const readAppSettings = () => getAppSettings(getDb());

/** Saves the Settings page; the admin page and `cli settings apply app` call it. */
export async function saveAppSettings(actor: Actor, input: AppSettings): Promise<AppSettings> {
  await getDb().transaction(async (tx) => {
    await putSetting(tx, "app", input);
    await audit(tx, actor, {
      action: "settings.updated",
      entityType: "settings",
      summary: "Changed the settings",
    });
    await notifyConfigChanged(tx);
  });
  return input;
}

const router = new Hono<AppEnv>();

router.get("/settings", async (c) => {
  requireUser(c);
  return c.json(await readAppSettings());
});

router.put("/settings", async (c) => {
  const actor = requireAdmin(c);
  const input = await jsonBody(c, appSettingsSchema);
  return c.json(await saveAppSettings(actor, input));
});

export default router;
