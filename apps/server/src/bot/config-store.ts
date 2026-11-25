import pg from "pg";
import { createHash } from "node:crypto";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@support-agent/shared/api/settings";
import { config } from "../config";
import { getDb } from "../db/client";
import { SecretDecryptionError, decryptSecret } from "../core/crypto";
import { getAppSettings, getStoredSlack } from "../core/settings";
import { CONFIG_CHANNEL } from "../core/config-events";
import { loadAgentRuntimes } from "../agent/runtime";
import type { AgentRuntime } from "../agent/pipeline";
import { logger } from "../logger";

export type SlackConnection = {
  botToken: string;
  appToken: string;
  botUserId: string | null;
  teamUrl: string | null;
  alertChannelId: string | null;
  /** Changes when a token changes, so the bot reconnects. */
  fingerprint: string;
};

export type BotConfig = {
  slack: SlackConnection | null;
  settings: AppSettings;
  /** Enabled agents by Slack channel ID. */
  agentsByChannel: Map<string, AgentRuntime>;
};

export async function loadBotConfig(): Promise<BotConfig> {
  const db = getDb();
  const [stored, settings, runtimes] = await Promise.all([
    getStoredSlack(db),
    getAppSettings(db),
    loadAgentRuntimes(db),
  ]);
  const agentsByChannel = new Map<string, AgentRuntime>();
  for (const agent of runtimes) {
    if (!agent.enabled) continue;
    for (const channelId of agent.channelIds) agentsByChannel.set(channelId, agent);
  }
  let slack: SlackConnection | null = null;
  if (stored.botTokenEncrypted && stored.appTokenEncrypted) {
    const botToken = decryptSecret(stored.botTokenEncrypted);
    const appToken = decryptSecret(stored.appTokenEncrypted);
    slack = {
      botToken,
      appToken,
      botUserId: stored.botUserId,
      teamUrl: stored.teamUrl,
      alertChannelId: stored.alertChannelId,
      fingerprint: createHash("sha256").update(`${botToken}\n${appToken}`).digest("hex"),
    };
  }
  return { slack, settings, agentsByChannel };
}

export const EMPTY_CONFIG: BotConfig = {
  slack: null,
  settings: DEFAULT_APP_SETTINGS,
  agentsByChannel: new Map(),
};

/**
 * The bot's configuration, reloaded when the admin interface saves a change
 * (Postgres NOTIFY) and every minute. When the database is unreachable the
 * last good configuration stays in use, so the bot keeps answering.
 */
export class ConfigStore {
  current: BotConfig = EMPTY_CONFIG;
  private listener: pg.Client | null = null;
  private timer: NodeJS.Timeout | null = null;
  private pending: NodeJS.Timeout | null = null;
  private stopped = false;
  /** Failed reloads in a row. */
  private failures = 0;

  constructor(private readonly onChange: (next: BotConfig, previous: BotConfig) => void) {}

  async start() {
    await this.reload();
    this.timer = setInterval(() => void this.reload(), 60_000);
    void this.listen();
  }

  async reload() {
    try {
      const next = await loadBotConfig();
      const previous = this.current;
      this.current = next;
      this.failures = 0;
      this.onChange(next, previous);
    } catch (error) {
      this.failures += 1;
      // A short database outage heals by itself. A credential the key cannot
      // decrypt does not, and neither does a database gone for five reloads:
      // those are errors (and error reports), once per run of failures.
      const report = error instanceof SecretDecryptionError ? this.failures === 1 : this.failures === 5;
      logger[report ? "error" : "warn"](
        { err: error, failures: this.failures },
        "could not reload the configuration; keeping the last one",
      );
    }
  }

  private scheduleReload() {
    if (this.pending) clearTimeout(this.pending);
    this.pending = setTimeout(() => {
      this.pending = null;
      void this.reload();
    }, 500);
  }

  private async listen() {
    if (this.stopped) return;
    const client = new pg.Client({ connectionString: config().DATABASE_URL });
    const retry = () => {
      if (this.listener === client) this.listener = null;
      client.removeAllListeners();
      void client.end().catch(() => undefined);
      if (!this.stopped) setTimeout(() => void this.listen(), 5_000);
    };
    client.on("error", (error) => {
      logger.warn({ err: error }, "configuration listener lost its database connection");
      retry();
    });
    client.on("notification", () => this.scheduleReload());
    try {
      await client.connect();
      await client.query(`LISTEN ${CONFIG_CHANNEL}`);
      this.listener = client;
      // Changes made while not listening.
      this.scheduleReload();
    } catch (error) {
      logger.warn({ err: error }, "could not listen for configuration changes");
      retry();
    }
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.pending) clearTimeout(this.pending);
    await this.listener?.end().catch(() => undefined);
  }
}
