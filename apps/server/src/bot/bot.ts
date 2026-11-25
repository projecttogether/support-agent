import { randomBytes } from "node:crypto";
import { hostname } from "node:os";
import { utimes, writeFile } from "node:fs/promises";
import { SocketModeClient } from "@slack/socket-mode";
import type { WebClient } from "@slack/web-api";
import type { BotState } from "@support-agent/shared/api/status";
import { config } from "../config";
import { and, gt, inArray, ne, sql } from "drizzle-orm";
import { getDb, type Db } from "../db/client";
import { botStatus } from "../db/schema";
import { logger } from "../logger";
import type { AgentRuntime } from "../agent/pipeline";
import { alertText } from "../agent/slack-format";
import { isSlackAuthFailure, slackApiUrl, slackErrorCode, slackLogger, webClient } from "../slack/web";
import { ConfigStore, type BotConfig } from "./config-store";
import {
  findInterrupted,
  handleMessage,
  handleReaction,
  resumeExchange,
  type HandlerDeps,
  type MessageEvent,
  type ReactionEvent,
} from "./handler";
import { webSlackPort, type SlackPort } from "./slack-port";
import { runMaintenance } from "./maintenance";

const HEARTBEAT_MS = 30_000;
const ALERT_INTERVAL_MS = 15 * 60_000;
const MAX_QUEUE = 200;
/**
 * How long a stop waits for the answers in progress. Below the container's
 * stop timeout (compose.yaml: stop_grace_period 1m for `bot`); what is not
 * done by then, the next bot process resumes.
 */
export const STOP_WAIT_MS = 45_000;
/** A bot process that reported this recently may still be answering. */
const ALIVE_MS = 2 * HEARTBEAT_MS;

type Envelope = { ack: () => Promise<void>; event: unknown };

/**
 * The Slack bot process: one Socket Mode connection, messages handled a few
 * at a time, a heartbeat for the admin interface and a watchdog that exits
 * (so the platform restarts the process) when Slack stays unreachable.
 */
export class Bot {
  private readonly instanceId = `${hostname()}-${process.pid}-${randomBytes(3).toString("hex")}`;
  private readonly startedAt = new Date();
  private readonly store = new ConfigStore((next, previous) => this.onConfig(next, previous));
  private socket: SocketModeClient | null = null;
  private web: WebClient | null = null;
  private port: SlackPort | null = null;
  private fingerprint: string | null = null;
  /** The bot's user ID from Slack, when the connection check has not stored it (yet). */
  private ownUserId: { fingerprint: string; id: string } | null = null;
  private state: BotState = "not_configured";
  private connectedSince: Date | null = null;
  private problemSince: number | null = null;
  private lastEventAt: Date | null = null;
  private authFailed = false;
  private running = 0;
  private readonly queue: (() => Promise<void>)[] = [];
  private readonly alerts = new Map<string, number>();
  private timers: NodeJS.Timeout[] = [];
  /** Delayed message handling (the headline wait); the next bot process resumes it after a restart. */
  private readonly delayed = new Set<NodeJS.Timeout>();
  /** Whether the exchanges that bot processes before this one left unfinished were taken up. */
  private resumed = false;
  /** Exchanges this process took up again (resumeInterrupted): a later look skips them. */
  private readonly resuming = new Set<string>();
  /** The database's time when this process started: what it takes on is recorded later. */
  private takesOnFrom = new Date();
  private stopping = false;

  async start() {
    // Exchanges get the database's time; a clock that differs here must not
    // make this process resume messages it took on itself.
    this.takesOnFrom = await databaseNow(getDb()).catch(() => new Date());
    await this.store.start();
    this.timers.push(
      setInterval(() => {
        void this.heartbeat();
        void this.resumeInterrupted();
      }, HEARTBEAT_MS),
    );
    this.timers.push(setInterval(() => this.watchdog(), 15_000));
    this.timers.push(
      setInterval(
        () =>
          void runMaintenance(getDb()).catch((error: unknown) =>
            logger.warn({ err: error }, "maintenance failed"),
          ),
        60 * 60_000,
      ),
    );
    void runMaintenance(getDb()).catch((error: unknown) => logger.warn({ err: error }, "maintenance failed"));
    await this.heartbeat();
    logger.info({ instanceId: this.instanceId }, "bot started");
  }

  private onConfig(next: BotConfig, previous: BotConfig) {
    const fingerprint = next.slack?.fingerprint ?? null;
    // A reload rebuilds the configuration from the database; keep the user ID
    // the bot looked up for these tokens.
    if (next.slack && !next.slack.botUserId && this.ownUserId?.fingerprint === fingerprint) {
      next.slack.botUserId = this.ownUserId.id;
    }
    if (fingerprint !== this.fingerprint) {
      this.fingerprint = fingerprint;
      void this.connect(next);
    } else if (this.authFailed && next.slack) {
      // Retry a rejected token on every reload, in case Slack recovered.
      void this.connect(next);
    }
    if (next.agentsByChannel.size !== previous.agentsByChannel.size) {
      logger.info({ channels: next.agentsByChannel.size }, "agents loaded");
    }
  }

  private setState(state: BotState) {
    if (state === this.state) return;
    this.state = state;
    if (state === "connected") {
      this.connectedSince = new Date();
      this.problemSince = null;
    } else {
      this.connectedSince = null;
      this.problemSince ??= Date.now();
    }
    void this.heartbeat();
  }

  private async connect(current: BotConfig) {
    const old = this.socket;
    this.socket = null;
    if (old) {
      old.removeAllListeners();
      await old.disconnect().catch(() => undefined);
    }
    if (!current.slack) {
      this.web = null;
      this.port = null;
      this.state = "not_configured";
      this.problemSince = null;
      void this.heartbeat();
      return;
    }
    const slack = current.slack;
    this.web = webClient(slack.botToken);
    this.port = webSlackPort(this.web, slack.botToken);
    if (!slack.botUserId) {
      // Normally stored by the connection check; ask Slack once otherwise.
      try {
        const auth = await this.web.auth.test();
        if (auth.user_id) {
          this.ownUserId = { fingerprint: slack.fingerprint, id: auth.user_id };
          // A reload during the lookup may have replaced the configuration.
          for (const target of [slack, this.store.current.slack]) {
            if (target?.fingerprint === slack.fingerprint && !target.botUserId)
              target.botUserId = auth.user_id;
          }
        }
      } catch {
        logger.warn("could not look up the bot's user ID");
      }
    }
    const socket = new SocketModeClient({
      appToken: slack.appToken,
      logger: slackLogger("slack-socket"),
      autoReconnectEnabled: true,
      clientOptions: slackApiUrl(),
    });
    this.socket = socket;
    socket.on("connecting", () => this.setState("connecting"));
    socket.on("reconnecting", () => this.setState("connecting"));
    socket.on("connected", () => {
      this.authFailed = false;
      this.setState("connected");
      logger.info("connected to Slack");
      void this.resumeInterrupted();
    });
    socket.on("disconnected", () => {
      if (this.socket === socket && !this.stopping) {
        this.setState("disconnected");
        logger.warn("disconnected from Slack");
      }
    });
    socket.on("message", (envelope: Envelope) => this.receive(envelope, "message"));
    socket.on("reaction_added", (envelope: Envelope) => this.receive(envelope, "reaction"));
    socket.on("reaction_removed", (envelope: Envelope) => this.receive(envelope, "reaction"));
    this.setState("connecting");
    try {
      await socket.start();
    } catch (error) {
      if (this.socket !== socket) return;
      const code = slackErrorCode(error);
      this.authFailed = isSlackAuthFailure(code);
      this.setState("disconnected");
      logger.error({ code }, "could not connect to Slack");
    }
  }

  private deps(port: SlackPort): HandlerDeps {
    return {
      db: getDb(),
      slack: port,
      config: () => this.store.current,
      alert: (agent: AgentRuntime, channel: string, message: string) => this.alert(agent, channel, message),
      later: (delayMs: number, task: () => Promise<void>) => this.later(delayMs, task),
      queue: (task: () => Promise<void>) => this.enqueue(task),
    };
  }

  private receive(envelope: Envelope, kind: "message" | "reaction") {
    // Acknowledge at once; Slack redelivers events that wait longer than three seconds.
    void envelope.ack().catch(() => undefined);
    this.lastEventAt = new Date();
    const port = this.port;
    if (!port) return;
    const deps = this.deps(port);
    if (kind === "reaction") {
      void handleReaction(deps, envelope.event as ReactionEvent).catch((error: unknown) =>
        logger.warn({ err: error }, "could not record feedback"),
      );
      return;
    }
    const event = envelope.event as MessageEvent;
    if (!this.store.current.agentsByChannel.has(event.channel)) return;
    // Takes the message on at once (its exchange); the answer waits in the queue.
    void handleMessage(deps, event).catch((error: unknown) =>
      logger.error({ err: error }, "message handling failed"),
    );
  }

  /**
   * Takes up, once, the messages that bot processes before this one took on
   * and did not finish (a deploy or a crash stopped them). Waits while
   * another bot process still reports: it may be answering them.
   */
  private async resumeInterrupted() {
    const port = this.port;
    if (this.resumed || this.stopping || !port || this.state !== "connected") return;
    try {
      if (await otherBotAlive(getDb(), this.instanceId)) return;
      this.resumed = true;
      const interrupted = await findInterrupted(getDb(), this.takesOnFrom);
      for (const exchange of interrupted) {
        if (this.resuming.has(exchange.id)) continue;
        this.resuming.add(exchange.id);
        void resumeExchange(this.deps(port), exchange).catch((error: unknown) => {
          // A passing failure (Slack, the database): the next heartbeat looks again,
          // and takes up only what is still pending and not taken up already.
          this.resuming.delete(exchange.id);
          this.resumed = false;
          logger.warn({ err: error }, "could not resume a message");
        });
      }
    } catch (error) {
      this.resumed = false;
      logger.warn({ err: error }, "could not look for interrupted messages");
    }
  }

  private later(delayMs: number, task: () => Promise<void>) {
    // While stopping, the exchange stays pending: the next bot process resumes it.
    if (this.stopping) return;
    const timer = setTimeout(() => {
      this.delayed.delete(timer);
      void task().catch((error: unknown) => logger.error({ err: error }, "message handling failed"));
    }, delayMs);
    this.delayed.add(timer);
  }

  private enqueue(task: () => Promise<void>) {
    if (this.queue.length >= MAX_QUEUE) {
      logger.error("too many waiting messages; dropping one");
      return;
    }
    this.queue.push(task);
    this.drain();
  }

  private drain() {
    while (this.running < config().BOT_CONCURRENCY && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.running += 1;
      void task()
        .catch((error: unknown) => logger.error({ err: error }, "message handling failed"))
        .finally(() => {
          this.running -= 1;
          this.drain();
        });
    }
  }

  /** Posts an error to the alert channel, at most every 15 minutes per agent and error. */
  private alert(agent: AgentRuntime, channel: string, message: string) {
    const target = this.store.current.slack?.alertChannelId;
    if (!target || !this.port) return;
    const key = `${agent.id}\n${message}`;
    const last = this.alerts.get(key) ?? 0;
    if (Date.now() - last < ALERT_INTERVAL_MS) return;
    this.alerts.set(key, Date.now());
    void this.port
      .postMessage({
        channel: target,
        threadTs: null,
        text: alertText(agent.name, channel, message),
        username: null,
        iconUrl: null,
      })
      .catch(() => undefined);
  }

  private async heartbeat() {
    const now = new Date();
    try {
      await getDb()
        .insert(botStatus)
        .values({
          instanceId: this.instanceId,
          state: this.state,
          version: config().APP_VERSION ?? null,
          startedAt: this.startedAt,
          connectedSince: this.connectedSince,
          lastHeartbeatAt: now,
          lastEventAt: this.lastEventAt,
        })
        .onConflictDoUpdate({
          target: botStatus.instanceId,
          set: {
            state: this.state,
            connectedSince: this.connectedSince,
            lastHeartbeatAt: now,
            lastEventAt: this.lastEventAt,
          },
        });
    } catch (error) {
      logger.warn({ err: error }, "could not record the bot status");
    }
    // Healthy: connected, or waiting for Slack to be set up in the admin interface.
    const file = config().BOT_HEARTBEAT_FILE;
    if (file && (this.state === "connected" || this.state === "not_configured")) {
      await utimes(file, now, now).catch(() => writeFile(file, "").catch(() => undefined));
    }
  }

  /** Exits when Slack stayed unreachable too long; the platform's restart policy starts a fresh process. */
  private watchdog() {
    const limit = config().BOT_WATCHDOG_SECONDS;
    if (!limit || this.stopping || this.authFailed || this.state === "not_configured") return;
    if (this.problemSince && Date.now() - this.problemSince > limit * 1000) {
      logger.fatal(
        { seconds: limit, state: this.state },
        "Slack unreachable for too long; exiting so the process restarts",
      );
      process.exitCode = 1;
      process.kill(process.pid, "SIGTERM");
    }
  }

  /**
   * Stops for a deploy or a restart: no new messages (Slack redelivers what
   * it could not deliver), then the answers in progress and in the queue get
   * STOP_WAIT_MS to finish. Messages that wait for a headline, or are not
   * answered by then, stay pending, and the next bot process resumes them.
   */
  async stop() {
    this.stopping = true;
    for (const timer of this.timers) clearInterval(timer);
    for (const timer of this.delayed) clearTimeout(timer);
    this.delayed.clear();
    await this.store.stop();
    const socket = this.socket;
    this.socket = null;
    await socket?.disconnect().catch(() => undefined);
    // Reported at once, so that the next bot process does not wait for this one.
    this.state = "disconnected";
    await this.heartbeat();
    const deadline = Date.now() + STOP_WAIT_MS;
    while ((this.running > 0 || this.queue.length > 0) && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 250));
    if (this.running > 0 || this.queue.length > 0) {
      logger.warn(
        { running: this.running, queued: this.queue.length },
        "stopping with unfinished answers; the next start resumes them",
      );
    }
  }
}

/** Whether another bot process reported recently that it is connected to Slack (or connecting). */
export async function otherBotAlive(db: Db, instanceId: string, now = Date.now()): Promise<boolean> {
  const rows = await db
    .select({ instanceId: botStatus.instanceId })
    .from(botStatus)
    .where(
      and(
        ne(botStatus.instanceId, instanceId),
        gt(botStatus.lastHeartbeatAt, new Date(now - ALIVE_MS)),
        inArray(botStatus.state, ["connected", "connecting"]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** The database's current time. */
async function databaseNow(db: Db): Promise<Date> {
  const result = await db.execute<{ now: Date | string }>(sql`select now() as now`);
  return new Date(result.rows[0]!.now);
}
