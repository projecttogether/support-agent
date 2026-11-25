import { slackManifestQuerySchema, slackSettingsUpdateSchema } from "@support-agent/shared/api/slack";
import { getStoredSlack } from "../core/settings";
import { getDb } from "../db/client";
import { parseWith } from "../http/errors";
import { parseJsonBody } from "../http/json";
import { checkSlack, listSlackChannels, readSlack, saveSlack, slackAppManifest } from "../modules/slack";
import { UsageError } from "./io";
import type { SingleSetting } from "./settings";

const SHOW_USAGE = "cli settings show slack [--channels | --manifest [--name <app name>]]";

/** `slack`: Admin › Slack (/api/v1/slack). */
export const slack: SingleSetting = {
  kind: "single",
  name: "slack",
  label: "Slack: the bot token, the app-level token and the alert channel",
  async status() {
    const stored = await getStoredSlack(getDb());
    if (!stored.botTokenEncrypted && !stored.appTokenEncrypted) return { state: "not set", hints: [] };
    const hints = [
      stored.botTokenEncrypted ? `bot token ${stored.botTokenHint ?? "stored"}` : "no bot token",
      stored.appTokenEncrypted ? `app-level token ${stored.appTokenHint ?? "stored"}` : "no app-level token",
    ];
    if (stored.teamName) hints.push(`workspace ${stored.teamName}`);
    if (stored.botName) hints.push(`bot @${stored.botName}`);
    if (stored.alertChannelId) hints.push(`alerts to ${stored.alertChannelId}`);
    if (stored.missingScopes.length) hints.push(`missing scopes ${stored.missingScopes.join(" ")}`);
    const complete =
      Boolean(stored.botTokenEncrypted && stored.appTokenEncrypted) && stored.missingScopes.length === 0;
    return { state: complete ? "set" : "incomplete", hints };
  },
  // The channels the bot can see (agents and the alert channel need their IDs), or the app manifest.
  async show({ channels, manifest, name }) {
    if (channels && manifest) throw new UsageError("Give --channels or --manifest, not both.", SHOW_USAGE);
    if (name !== undefined && !manifest) throw new UsageError("--name goes with --manifest.", SHOW_USAGE);
    if (channels) return listSlackChannels();
    if (manifest) return slackAppManifest(parseWith(slackManifestQuerySchema, { name }).name);
    return readSlack();
  },
  showOptions: {
    options: { channels: { type: "boolean" }, manifest: { type: "boolean" }, name: { type: "string" } },
    usage: SHOW_USAGE,
  },
  apply: (actor, body) => saveSlack(actor, parseJsonBody(body, slackSettingsUpdateSchema)),
  test: () => checkSlack(),
};
