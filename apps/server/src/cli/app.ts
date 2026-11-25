import { eq } from "drizzle-orm";
import { appSettingsSchema } from "@support-agent/shared/api/settings";
import { getDb } from "../db/client";
import { settings } from "../db/schema";
import { parseJsonBody } from "../http/json";
import { readAppSettings, saveAppSettings } from "../modules/settings";
import type { SingleSetting } from "./settings";

/** `app`: Admin › Settings (/api/v1/settings). */
export const app: SingleSetting = {
  kind: "single",
  name: "app",
  label: "Settings: how long texts are kept, the error message, the working reaction",
  async status() {
    const [row] = await getDb().select({ key: settings.key }).from(settings).where(eq(settings.key, "app"));
    const current = await readAppSettings();
    const hints = [
      current.retentionDays === 0 ? "keeps no texts" : `keeps texts ${current.retentionDays} days`,
      current.workingReaction ? `reaction :${current.workingReaction}:` : "no reaction",
    ];
    return row ? { state: "set", hints } : { state: "not set", hints: ["the defaults", ...hints] };
  },
  show: () => readAppSettings(),
  apply: (actor, body) => saveAppSettings(actor, parseJsonBody(body, appSettingsSchema)),
};
