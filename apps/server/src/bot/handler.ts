import { and, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { exchanges } from "../db/schema";
import { cleanSlackText } from "../agent/slack-format";
import {
  runPipeline as defaultRunPipeline,
  type AgentRuntime,
  type PipelineInput,
  type PipelineResult,
  type ThreadMessage,
} from "../agent/pipeline";
import { replyFor, type Reply } from "../agent/reply";
import type { ImageInput } from "../llm";
import { logger } from "../logger";
import type { BotConfig } from "./config-store";
import type { SlackFile, SlackPort } from "./slack-port";

/** The parts of a Slack message event the bot reads. */
export type MessageEvent = {
  type: "message";
  subtype?: string;
  channel: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  files?: SlackFile[];
};

export type ReactionEvent = {
  type: "reaction_added" | "reaction_removed";
  user?: string;
  reaction: string;
  item_user?: string;
  item?: { type?: string; channel?: string; ts?: string };
};

/** Message subtypes that carry a person's question. */
const HANDLED_SUBTYPES = new Set([undefined, "file_share", "thread_broadcast"]);
/** Events older than this are skipped (a backlog after downtime gets no late answers). */
const MAX_EVENT_AGE_MS = 15 * 60_000;
const MAX_IMAGES = 3;
/** After a reply under a headline, how long to wait for more of the request before answering. */
export const HEADLINE_WAIT_MS = 30_000;

export type HandlerDeps = {
  db: Db;
  slack: SlackPort;
  config: () => BotConfig;
  runPipeline?: (input: PipelineInput) => Promise<PipelineResult>;
  alert?: (agent: AgentRuntime, channel: string, message: string) => void;
  now?: () => number;
  /** Runs a task after a delay; without it, the task runs at once. */
  later?: (delayMs: number, task: () => Promise<void>) => void;
  /** Queues the answer to a message (the bot answers a few at a time); without it, it runs at once. */
  queue?: (task: () => Promise<void>) => void;
};

/**
 * A later turn of the same message: after the headline wait (`waited`), or
 * resumed after a restart. `exchangeId` is the message's exchange, recorded
 * when the agent took the message on.
 */
export type Turn = { exchangeId: string; waited?: boolean };

const mentionsOf = (text: string) => [...text.matchAll(/<@([UW][A-Z0-9]+)>/g)].map((match) => match[1]!);

type Consider = {
  consider: boolean;
  mentioned: boolean;
  /** A reply of the poster under their headline: answered after a wait for more of the request. */
  underHeadline: boolean;
  /** The headline itself is still being decided. */
  headlinePending: boolean;
};

/** Whether the agent should consider the message at all (before any model call). */
export async function shouldConsider(
  deps: Pick<HandlerDeps, "db">,
  agent: AgentRuntime,
  event: MessageEvent,
  botUserId: string | null,
): Promise<Consider> {
  const text = event.text ?? "";
  const mentions = mentionsOf(text);
  const mentioned = Boolean(botUserId && mentions.includes(botUserId));
  const no = { consider: false, mentioned, underHeadline: false, headlinePending: false };
  const isReply = Boolean(event.thread_ts && event.thread_ts !== event.ts);
  if (!isReply) return { ...no, consider: mentioned || agent.replyMode === "questions" };
  if (mentioned) return { ...no, consider: true };
  if (!agent.id || (!agent.followUpsInThreads && !agent.headlineThreads)) return no;
  const rows = await deps.db
    .select({
      outcome: exchanges.outcome,
      messageTs: exchanges.messageTs,
      slackUserId: exchanges.slackUserId,
    })
    .from(exchanges)
    .where(
      and(
        eq(exchanges.channelId, event.channel),
        eq(exchanges.agentId, agent.id),
        inArray(exchanges.outcome, ["answered", "headline", "pending"]),
        or(eq(exchanges.threadTs, event.thread_ts!), eq(exchanges.messageTs, event.thread_ts!)),
      ),
    );
  if (rows.some((row) => row.outcome === "answered")) {
    if (!agent.followUpsInThreads) return no;
    // Replies addressed to someone else are for people.
    if (mentions.some((id) => id !== botUserId)) return no;
    return { ...no, consider: true };
  }
  // Under a headline only the poster's replies count; the triage decides on mentions there.
  const root = rows.find((row) => row.messageTs === event.thread_ts);
  const headline = root?.outcome === "headline" || root?.outcome === "pending";
  if (agent.headlineThreads && headline && root?.slackUserId === event.user) {
    return { ...no, consider: true, underHeadline: true, headlinePending: root.outcome === "pending" };
  }
  return no;
}

/**
 * After the headline wait: whether the poster wrote more since (the newest
 * reply answers for all), or a colleague replied (a person took over).
 * Answers anyway when Slack can't tell.
 */
async function movedOn(slack: SlackPort, event: MessageEvent, botUserId: string | null): Promise<boolean> {
  const authors = await slack.threadAuthors(event.channel, event.thread_ts!).catch(() => null);
  if (!authors) return false;
  return authors.some(
    (author) =>
      (author.userId === event.user && Number(author.ts) > Number(event.ts)) ||
      (author.userId !== null &&
        author.userId !== event.user &&
        author.userId !== botUserId &&
        !author.fromBot),
  );
}

/**
 * Handles one Slack message: decide, answer in the thread, record the exchange.
 * The exchange is recorded as soon as the agent takes the message on, before
 * it waits or queues: a redelivered event finds it and stops, and the next bot
 * process resumes it when a restart cuts the handling short (`resumeExchange`).
 * `turn`: a later turn of a message taken on already.
 */
export async function handleMessage(deps: HandlerDeps, event: MessageEvent, turn?: Turn): Promise<void> {
  const current = deps.config();
  // A later turn that ends here forgets the exchange: the message was never answered.
  const drop = async () => {
    if (turn) await forget(deps.db, turn.exchangeId);
  };
  if (!HANDLED_SUBTYPES.has(event.subtype)) return drop();
  if (!event.user || event.bot_id) return drop();
  const agent = current.agentsByChannel.get(event.channel);
  if (!agent || !current.slack) return drop();
  const botUserId = current.slack.botUserId;
  if (event.user === botUserId) return drop();
  const now = deps.now?.() ?? Date.now();
  if (now - Number(event.ts) * 1000 > MAX_EVENT_AGE_MS) {
    logger.info({ channelId: event.channel }, "skipping an old message");
    return drop();
  }

  const { consider, mentioned, underHeadline, headlinePending } = await shouldConsider(
    deps,
    agent,
    event,
    botUserId,
  );
  if (!consider) return drop();

  const question = cleanSlackText(event.text ?? "", botUserId).slice(0, 4000);
  const keepText = current.settings.retentionDays > 0;
  let exchangeId = turn?.exchangeId;
  if (!exchangeId) {
    // One row per Slack message: a redelivered event finds it and stops here.
    const [row] = await deps.db
      .insert(exchanges)
      .values({
        agentId: agent.id,
        agentName: agent.name,
        channelId: event.channel,
        slackUserId: event.user,
        messageTs: event.ts,
        threadTs: event.thread_ts ?? null,
        question: keepText ? question : null,
      })
      .onConflictDoNothing()
      .returning({ id: exchanges.id });
    if (!row) return;
    exchangeId = row.id;
  }
  const id = exchangeId;

  if (underHeadline && (!turn?.waited || headlinePending)) {
    // The request may come in several messages: answer once, after the poster paused.
    // While the headline is still being decided, wait again (up to MAX_EVENT_AGE_MS).
    const task = () => handleMessage(deps, event, { exchangeId: id, waited: true });
    if (deps.later) deps.later(HEADLINE_WAIT_MS, task);
    else if (!turn?.waited) await task();
    else await forget(deps.db, id);
    return;
  }
  // Every reply back from the wait, also one whose thread got answered meanwhile.
  if (turn?.waited && (await movedOn(deps.slack, event, botUserId))) {
    logger.info(
      { channelId: event.channel },
      "skipping a reply under a headline: the poster or a colleague wrote since",
    );
    await forget(deps.db, id);
    return;
  }

  const answer = () =>
    answerMessage(deps, { event, exchangeId: id, agent, question, keepText, mentioned, underHeadline });
  if (deps.queue) deps.queue(answer);
  else await answer();
}

/** Deletes the exchange of a message the agent took on but did not answer. */
async function forget(db: Db, exchangeId: string) {
  await db.delete(exchanges).where(and(eq(exchanges.id, exchangeId), eq(exchanges.outcome, "pending")));
}

type Answering = {
  event: MessageEvent;
  exchangeId: string;
  agent: AgentRuntime;
  question: string;
  keepText: boolean;
  mentioned: boolean;
  underHeadline: boolean;
};

/** Answers a message the agent took on, in its thread, and records the result in its exchange. */
async function answerMessage(deps: HandlerDeps, answering: Answering): Promise<void> {
  const { event, exchangeId, agent, question, keepText, mentioned, underHeadline } = answering;
  const { slack } = deps;
  const current = deps.config();
  const botUserId = current.slack?.botUserId ?? null;
  const started = Date.now();
  const threadTs = event.thread_ts ?? event.ts;
  const reaction = current.settings.workingReaction;
  let reacted = false;
  let result: PipelineResult | null = null;
  let reply: Reply | null = null;
  let answerTs: string | null = null;
  let postError: string | null = null;
  try {
    let thread: ThreadMessage[] = [];
    if (event.thread_ts && event.thread_ts !== event.ts) {
      thread = await slack.threadHistory(event.channel, event.thread_ts, event.ts, botUserId).catch(() => []);
    }
    const images: ImageInput[] = [];
    let imageNote: string | null = null;
    const files = (event.files ?? []).filter((file) => file.mimetype?.startsWith("image/"));
    if (files.length > 0 && agent.readImages) {
      for (const file of files.slice(0, MAX_IMAGES)) {
        const image = await slack.downloadImage(file);
        if (image) images.push(image);
      }
      if (images.length < Math.min(files.length, MAX_IMAGES)) {
        imageNote = "The person attached an image that could not be read.";
      }
    } else if (files.length > 0) {
      imageNote = "The person attached an image.";
    }
    if (reaction) {
      await slack.addReaction(event.channel, event.ts, reaction);
      reacted = true;
    }
    result = await (deps.runPipeline ?? defaultRunPipeline)({
      agent,
      question: question || "(no text)",
      thread,
      images,
      mentioned,
      imageNote,
      inThread: Boolean(event.thread_ts && event.thread_ts !== event.ts),
      underHeadline,
    });
    reply = replyFor(result, agent, current.settings.errorMessage);
    // The outcome is stored before the reply is posted, so that a restart in
    // between never posts it twice: only exchanges still pending are resumed.
    // When the database fails here, the bot answers anyway.
    await recordResult(deps.db, exchangeId, { result, reply, keepText, postError: null }).catch(
      (error: unknown) => logger.warn({ err: error, agentId: agent.id }, "could not record the result"),
    );
    if (reply?.text) {
      answerTs = await slack.postMessage({
        channel: event.channel,
        threadTs,
        ...reply,
        username: agent.displayName,
        iconUrl: agent.iconUrl,
      });
    }
    if (result.outcome === "error") deps.alert?.(agent, event.channel, result.error ?? "Unknown error");
  } catch (error) {
    postError = "Could not post the answer to Slack";
    logger.error(
      { err: error, agentId: agent.id, channelId: event.channel },
      "could not handle a Slack message",
    );
    deps.alert?.(agent, event.channel, postError);
  } finally {
    if (reacted && reaction) await slack.removeReaction(event.channel, event.ts, reaction);
  }

  await recordResult(deps.db, exchangeId, {
    result,
    reply,
    keepText,
    postError,
    answerTs,
    latencyMs: Date.now() - started,
  });
}

/** Writes what the agent did into the message's exchange. */
async function recordResult(
  db: Db,
  exchangeId: string,
  values: {
    result: PipelineResult | null;
    reply: Reply | null;
    keepText: boolean;
    postError: string | null;
    answerTs?: string | null;
    latencyMs?: number;
  },
) {
  const { result, reply, keepText, postError } = values;
  const outcome = postError ? "error" : (result?.outcome ?? "error");
  const cited = result ? result.sources.filter((source) => result.citedRefs.includes(source.ref)) : [];
  // The error message is a reply, not an answer: errors keep no answer text.
  const answer = keepText && result?.outcome !== "error" ? (reply?.text ?? null) : null;
  await db
    .update(exchanges)
    .set({
      outcome,
      // Maintenance may have cleared this exchange while the model was running.
      answer: sql`case when ${exchanges.textRemovedAt} is null then ${answer} end`,
      reason: sql`case when ${exchanges.textRemovedAt} is null then ${keepText ? (result?.reason ?? null) : null} end`,
      searchQueries: sql`case when ${exchanges.textRemovedAt} is null
        then ${JSON.stringify(keepText ? (result?.searchQueries ?? []) : [])}::jsonb else '[]'::jsonb end`,
      sources: cited.map((source) => ({ title: source.title, url: source.url })),
      provider: result?.provider ?? null,
      model: result?.model ?? null,
      usedFallback: result?.usedFallback ?? false,
      error: postError ?? result?.error ?? null,
      ...(values.answerTs === undefined ? {} : { answerTs: values.answerTs }),
      ...(values.latencyMs === undefined ? {} : { latencyMs: values.latencyMs }),
      inputTokens: result?.usage.inputTokens ?? 0,
      outputTokens: result?.usage.outputTokens ?? 0,
      updatedAt: sql`now()`,
    })
    .where(eq(exchanges.id, exchangeId));
}

/** An exchange that a bot process took on and did not finish, because it stopped. */
export type Interrupted = { id: string; channelId: string; messageTs: string; threadTs: string | null };

/**
 * The exchanges that bot processes before `startedAt` took on and did not
 * finish: still pending, and recent enough to answer (MAX_EVENT_AGE_MS).
 */
export async function findInterrupted(db: Db, startedAt: Date, now = Date.now()): Promise<Interrupted[]> {
  return db
    .select({
      id: exchanges.id,
      channelId: exchanges.channelId,
      messageTs: exchanges.messageTs,
      threadTs: exchanges.threadTs,
    })
    .from(exchanges)
    .where(
      and(
        eq(exchanges.outcome, "pending"),
        lt(exchanges.createdAt, startedAt),
        gt(exchanges.createdAt, new Date(now - MAX_EVENT_AGE_MS)),
      ),
    )
    .orderBy(exchanges.createdAt);
}

/**
 * Takes up a message that an earlier bot process took on and did not finish
 * (a deploy or a crash stopped it): reads the message from Slack again and
 * handles it as a later turn, so a reply under a headline waits again. A
 * message that is gone is forgotten. When the bot already replied after it
 * (a version that posted before it stored the outcome), it stays as it is.
 */
export async function resumeExchange(deps: HandlerDeps, interrupted: Interrupted): Promise<void> {
  const botUserId = deps.config().slack?.botUserId ?? null;
  const found = await deps.slack.findMessage(
    interrupted.channelId,
    interrupted.threadTs ?? interrupted.messageTs,
    interrupted.messageTs,
  );
  if (!found) {
    await forget(deps.db, interrupted.id);
    return;
  }
  if (botUserId && found.later.some((author) => author.userId === botUserId)) {
    logger.info({ channelId: interrupted.channelId }, "not resuming a message the bot replied to");
    return;
  }
  logger.info({ channelId: interrupted.channelId }, "resuming a message a restart interrupted");
  await handleMessage(
    deps,
    { ...found.message, type: "message", channel: interrupted.channelId },
    { exchangeId: interrupted.id },
  );
}

const HELPFUL = new Set(["+1", "thumbsup", "white_check_mark", "heavy_check_mark"]);
const NOT_HELPFUL = new Set(["-1", "thumbsdown"]);

/** 👍 / 👎 on an answer of the bot becomes feedback on its exchange. */
export async function handleReaction(
  deps: Pick<HandlerDeps, "db" | "config">,
  event: ReactionEvent,
): Promise<void> {
  const botUserId = deps.config().slack?.botUserId;
  if (!botUserId || event.item_user !== botUserId || event.user === botUserId) return;
  const channel = event.item?.channel;
  const ts = event.item?.ts;
  if (!channel || !ts) return;
  const value = HELPFUL.has(event.reaction) ? 1 : NOT_HELPFUL.has(event.reaction) ? -1 : 0;
  if (value === 0) return;
  const feedback = event.type === "reaction_added" ? value : 0;
  const condition = and(eq(exchanges.channelId, channel), eq(exchanges.answerTs, ts));
  await deps.db
    .update(exchanges)
    .set({ feedback, updatedAt: sql`now()` })
    .where(event.type === "reaction_added" ? condition : and(condition, eq(exchanges.feedback, value)));
}
