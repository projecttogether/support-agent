import { Hono } from "hono";

import {
  slackManifestQuerySchema,
  slackSettingsUpdateSchema,
  type SlackChannel,
  type SlackChannels,
  type SlackCheckResult,
  type SlackSettings,
  type SlackSettingsUpdate,
} from "@support-agent/shared/api/slack";
import { getDb } from "../db/client";
import { agentChannels } from "../db/schema";
import { decryptSecret, encryptSecret, secretHint } from "../core/crypto";
import { audit } from "../core/audit";
import { notifyConfigChanged } from "../core/config-events";
import { getStoredSlack, putStoredSlack, type StoredSlack } from "../core/settings";
import type { Actor } from "../auth/principal";
import type { AppEnv } from "../http/env";
import { AppError } from "../http/errors";
import { jsonBody, queryOf, requireAdmin, requireUser } from "../http/middleware";
import { checkSlackTokens, webClient } from "../slack/web";
import { slackManifest } from "../slack/manifest";
import { config } from "../config";

function toSettings(stored: StoredSlack): SlackSettings {
  return {
    hasBotToken: Boolean(stored.botTokenEncrypted),
    hasAppToken: Boolean(stored.appTokenEncrypted),
    botTokenHint: stored.botTokenEncrypted ? stored.botTokenHint : null,
    appTokenHint: stored.appTokenEncrypted ? stored.appTokenHint : null,
    teamId: stored.teamId,
    teamName: stored.teamName,
    botUserId: stored.botUserId,
    botName: stored.botName,
    missingScopes: stored.missingScopes,
    alertChannelId: stored.alertChannelId,
  };
}

// ---------------------------------------------------------------------------
// Service: the admin page's routes and `cli settings … slack` call these.
// ---------------------------------------------------------------------------

export async function readSlack(): Promise<SlackSettings> {
  return toSettings(await getStoredSlack(getDb()));
}

export async function saveSlack(actor: Actor, input: SlackSettingsUpdate): Promise<SlackSettings> {
  const stored = await getDb().transaction(async (tx) => {
    const current = await getStoredSlack(tx);
    const next: StoredSlack = { ...current };
    const changed: string[] = [];
    if (input.botToken !== undefined) {
      next.botTokenEncrypted = encryptSecret(input.botToken);
      next.botTokenHint = secretHint(input.botToken);
      // Workspace details come from the next check.
      next.teamId = null;
      next.teamName = null;
      next.teamUrl = null;
      next.botUserId = null;
      next.botName = null;
      next.missingScopes = [];
      changed.push("bot token");
    }
    if (input.appToken !== undefined) {
      next.appTokenEncrypted = encryptSecret(input.appToken);
      next.appTokenHint = secretHint(input.appToken);
      changed.push("app-level token");
    }
    if (input.alertChannelId !== undefined) {
      next.alertChannelId = input.alertChannelId;
      changed.push("alert channel");
    }
    await putStoredSlack(tx, next);
    if (changed.length > 0) {
      await audit(tx, actor, {
        action: "slack.updated",
        entityType: "slack",
        summary: `Changed the Slack connection: ${changed.join(", ")}`,
      });
    }
    await notifyConfigChanged(tx);
    return next;
  });
  return toSettings(stored);
}

/** The page's check: both tokens, and the workspace details it stores. */
export async function checkSlack(): Promise<SlackCheckResult> {
  const db = getDb();
  const stored = await getStoredSlack(db);
  if (!stored.botTokenEncrypted) {
    return {
      ok: false,
      message: "Enter the bot token first",
      latencyMs: null,
      teamName: null,
      botName: null,
      missingScopes: [],
      missingOptionalScopes: [],
    };
  }
  const started = performance.now();
  const check = await checkSlackTokens(
    decryptSecret(stored.botTokenEncrypted),
    stored.appTokenEncrypted ? decryptSecret(stored.appTokenEncrypted) : null,
  );
  if (check.teamId) {
    await db.transaction(async (tx) => {
      const current = await getStoredSlack(tx);
      await putStoredSlack(tx, {
        ...current,
        teamId: check.teamId,
        teamName: check.teamName,
        teamUrl: check.teamUrl,
        botUserId: check.botUserId,
        botName: check.botName,
        missingScopes: check.missingScopes,
      });
      await notifyConfigChanged(tx);
    });
  }
  return {
    ok: check.ok,
    message: check.message,
    latencyMs: Math.round(performance.now() - started),
    teamName: check.teamName,
    botName: check.botName,
    missingScopes: check.missingScopes,
    missingOptionalScopes: check.missingOptionalScopes,
  };
}

/** Channels the bot can see, for the channel picker. */
export async function listSlackChannels(): Promise<SlackChannels> {
  const db = getDb();
  const stored = await getStoredSlack(db);
  if (!stored.botTokenEncrypted) {
    throw new AppError(409, "slack_not_configured", "Connect Slack first, or enter channel IDs by hand");
  }
  const client = webClient(decryptSecret(stored.botTokenEncrypted));
  const used = new Map(
    (
      await db
        .select({ channelId: agentChannels.channelId, agentId: agentChannels.agentId })
        .from(agentChannels)
    ).map((row) => [row.channelId, row.agentId]),
  );
  const channels: SlackChannel[] = [];
  let cursor: string | undefined;
  try {
    do {
      const page = await client.conversations.list({
        types: "public_channel,private_channel",
        exclude_archived: true,
        limit: 1000,
        ...(cursor ? { cursor } : {}),
      });
      for (const channel of page.channels ?? []) {
        if (!channel.id || !channel.name) continue;
        channels.push({
          id: channel.id,
          name: channel.name,
          isPrivate: Boolean(channel.is_private),
          isMember: Boolean(channel.is_member),
          agentId: used.get(channel.id) ?? null,
        });
      }
      cursor = page.response_metadata?.next_cursor || undefined;
    } while (cursor && channels.length < 5000);
  } catch {
    throw new AppError(502, "slack_error", "Could not load the channels from Slack. Check the connection.");
  }
  channels.sort((a, b) => a.name.localeCompare(b.name));
  return { channels, botName: stored.botName };
}

/** The Slack app manifest to create the app with, under `name` or the app's name. */
export function slackAppManifest(name: string | null | undefined) {
  return { manifest: slackManifest(name ?? config().APP_NAME) };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const router = new Hono<AppEnv>();

router.get("/slack", async (c) => {
  requireAdmin(c);
  return c.json(await readSlack());
});

router.patch("/slack", async (c) => {
  const actor = requireAdmin(c);
  const input = await jsonBody(c, slackSettingsUpdateSchema);
  return c.json(await saveSlack(actor, input));
});

router.post("/slack/check", async (c) => {
  requireAdmin(c);
  return c.json(await checkSlack());
});

router.get("/slack/channels", async (c) => {
  requireUser(c);
  return c.json(await listSlackChannels());
});

router.get("/slack/manifest", (c) => {
  requireAdmin(c);
  const { name } = queryOf(c, slackManifestQuerySchema);
  return c.json(slackAppManifest(name));
});

export default router;

/** Link to a Slack message, from the workspace URL of the last check. */
export function permalink(teamUrl: string | null, channelId: string, ts: string, threadTs: string | null) {
  if (!teamUrl) return null;
  const base = `${teamUrl.replace(/\/+$/, "")}/archives/${channelId}/p${ts.replace(".", "")}`;
  return threadTs && threadTs !== ts ? `${base}?thread_ts=${threadTs}&cid=${channelId}` : base;
}

export async function teamUrl(): Promise<string | null> {
  return (await getStoredSlack(getDb())).teamUrl;
}
