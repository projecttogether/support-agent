import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { DEFAULT_APP_SETTINGS } from "@support-agent/shared/api/settings";
import { getDb } from "../db/client";
import { agents, exchanges } from "../db/schema";
import { resetDatabase } from "../test/helpers";
import type { AgentRuntime, PipelineResult } from "../agent/pipeline";
import type { BotConfig } from "./config-store";
import {
  HEADLINE_WAIT_MS,
  findInterrupted,
  handleMessage,
  handleReaction,
  resumeExchange,
  type HandlerDeps,
  type MessageEvent,
} from "./handler";
import type { FoundMessage, SlackPort, ThreadAuthor } from "./slack-port";
import { runMaintenance } from "./maintenance";
import { putSetting } from "../core/settings";

const AGENT_ID = "00000000-0000-4000-8000-0000000000a1";
const BOT = "UBOT";

function agent(overrides: Partial<AgentRuntime> = {}): AgentRuntime {
  return {
    id: AGENT_ID,
    name: "IT support",
    enabled: true,
    instructions: "",
    replyMode: "questions",
    followUpsInThreads: false,
    noAnswerMode: "escalate",
    escalationMessage: "Ask the IT team.",
    headlineThreads: false,
    headlineMessage: "One message, please.",
    displayName: "IT Helper",
    iconUrl: null,
    readImages: true,
    channelIds: ["C0SUPPORT"],
    main: null,
    fallback: null,
    sources: [],
    ...overrides,
  };
}

function botConfig(runtime: AgentRuntime, settings = DEFAULT_APP_SETTINGS): BotConfig {
  return {
    slack: {
      botToken: "xoxb",
      appToken: "xapp",
      botUserId: BOT,
      teamUrl: null,
      alertChannelId: null,
      fingerprint: "f",
    },
    settings,
    agentsByChannel: new Map(runtime.channelIds.map((id) => [id, runtime])),
  };
}

function result(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    outcome: "answered",
    reason: "A question",
    searchQueries: ["printer"],
    sources: [
      {
        ref: "S1",
        knowledgeSourceName: "KB",
        title: "Printers",
        url: "https://it.example.org/p",
        section: null,
        text: "x",
      },
    ],
    citedRefs: ["S1"],
    answer: "Use the printer on floor 2.",
    provider: "Main",
    model: "m",
    usedFallback: false,
    error: null,
    timings: { triageMs: 1, searchMs: 1, answerMs: 1, totalMs: 3 },
    usage: { inputTokens: 50, outputTokens: 5 },
    ...overrides,
  };
}

function fakeSlack(authors: ThreadAuthor[] = [], found: FoundMessage | null = null) {
  const posted: Parameters<SlackPort["postMessage"]>[0][] = [];
  const reactions: string[] = [];
  const port: SlackPort = {
    postMessage: vi.fn(async (message) => {
      posted.push(message);
      return `17000000${posted.length}.000100`;
    }),
    addReaction: vi.fn(async (_channel, ts, name) => {
      reactions.push(`+${name}@${ts}`);
    }),
    removeReaction: vi.fn(async (_channel, ts, name) => {
      reactions.push(`-${name}@${ts}`);
    }),
    threadHistory: vi.fn(async () => [{ role: "person" as const, text: "earlier" }]),
    threadAuthors: vi.fn(async () => authors),
    findMessage: vi.fn(async () => found),
    downloadImage: vi.fn(async () => null),
  };
  return { port, posted, reactions };
}

const nowSeconds = () => (Date.now() / 1000).toFixed(6);
const message = (overrides: Partial<MessageEvent> = {}): MessageEvent => ({
  type: "message",
  channel: "C0SUPPORT",
  user: "UPERSON",
  text: "Which printer can I use?",
  ts: nowSeconds(),
  ...overrides,
});

beforeEach(async () => {
  await resetDatabase();
  await getDb().insert(agents).values({ id: AGENT_ID, name: "IT support" });
});

describe("handleMessage", () => {
  it("answers a question in its thread and records the exchange", async () => {
    const slack = fakeSlack();
    const run = vi.fn(async () => result());
    const event = message();
    await handleMessage(
      { db: getDb(), slack: slack.port, config: () => botConfig(agent()), runPipeline: run },
      event,
    );
    expect(slack.posted).toEqual([
      {
        channel: "C0SUPPORT",
        threadTs: event.ts,
        text: "Use the printer on floor 2.\n\n:page_facing_up: <https://it.example.org/p|Printers>",
        autoLinkUrls: false,
        username: "IT Helper",
        iconUrl: null,
      },
    ]);
    expect(slack.reactions).toEqual([`+eyes@${event.ts}`, `-eyes@${event.ts}`]);
    const [row] = await getDb().select().from(exchanges);
    expect(row).toMatchObject({
      agentId: AGENT_ID,
      outcome: "answered",
      question: "Which printer can I use?",
      answer: "Use the printer on floor 2.\n\n:page_facing_up: <https://it.example.org/p|Printers>",
      sources: [{ title: "Printers", url: "https://it.example.org/p" }],
      answerTs: "170000001.000100",
      inputTokens: 50,
    });
  });

  it("handles a redelivered event only once", async () => {
    const slack = fakeSlack();
    const run = vi.fn(async () => result());
    const event = message();
    const deps = { db: getDb(), slack: slack.port, config: () => botConfig(agent()), runPipeline: run };
    await Promise.all([handleMessage(deps, event), handleMessage(deps, event)]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(slack.posted).toHaveLength(1);
  });

  it("ignores bots, other channels, edits, old messages and its own messages", async () => {
    const slack = fakeSlack();
    const run = vi.fn(async () => result());
    const deps = { db: getDb(), slack: slack.port, config: () => botConfig(agent()), runPipeline: run };
    await handleMessage(deps, message({ bot_id: "B1" }));
    await handleMessage(deps, message({ channel: "C0OTHER" }));
    await handleMessage(deps, message({ subtype: "message_changed" }));
    await handleMessage(deps, message({ user: BOT }));
    await handleMessage(deps, message({ ts: (Date.now() / 1000 - 3600).toFixed(6) }));
    expect(run).not.toHaveBeenCalled();
    expect(await getDb().select().from(exchanges)).toHaveLength(0);
  });

  it("in mentions mode answers only when mentioned", async () => {
    const slack = fakeSlack();
    const run = vi.fn(async () => result());
    const deps = {
      db: getDb(),
      slack: slack.port,
      config: () => botConfig(agent({ replyMode: "mentions" })),
      runPipeline: run,
    };
    await handleMessage(deps, message());
    expect(run).not.toHaveBeenCalled();
    await handleMessage(deps, message({ text: `<@${BOT}> which printer?` }));
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ question: "which printer?", mentioned: true }),
    );
  });

  it("answers thread replies with a mention, and follow-ups only when enabled", async () => {
    const slack = fakeSlack();
    const run = vi.fn(async () => result());
    const root = message();
    const deps = { db: getDb(), slack: slack.port, config: () => botConfig(agent()), runPipeline: run };
    await handleMessage(deps, root);
    await handleMessage(deps, message({ thread_ts: root.ts, text: "And in colour?" }));
    expect(run).toHaveBeenCalledTimes(1);

    const followUps = { ...deps, config: () => botConfig(agent({ followUpsInThreads: true })) };
    await handleMessage(followUps, message({ thread_ts: root.ts, text: "<@UCOLLEAGUE> can you check?" }));
    expect(run).toHaveBeenCalledTimes(1);
    await handleMessage(followUps, message({ thread_ts: root.ts, text: "And in colour?" }));
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith(
      expect.objectContaining({ thread: [{ role: "person", text: "earlier" }] }),
    );
    expect(slack.posted.at(-1)?.threadTs).toBe(root.ts);
  });

  describe("under a headline", () => {
    const headline = () => result({ outcome: "headline", answer: null, sources: [], citedRefs: [] });

    /** Posts a headline; the deps collect delayed tasks for the test to run. */
    async function afterHeadline(slack: ReturnType<typeof fakeSlack>, run: HandlerDeps["runPipeline"]) {
      const waiting: { delayMs: number; task: () => Promise<void> }[] = [];
      const deps: HandlerDeps = {
        db: getDb(),
        slack: slack.port,
        config: () => botConfig(agent({ headlineThreads: true })),
        runPipeline: run,
        later: (delayMs, task) => waiting.push({ delayMs, task }),
      };
      const root = message({ text: "Question about the VPN" });
      await handleMessage(deps, root);
      return { deps, root, waiting };
    }

    it("posts the headline message, then answers the poster's reply after the wait", async () => {
      const slack = fakeSlack();
      const run = vi.fn<NonNullable<HandlerDeps["runPipeline"]>>(async () => headline());
      const { deps, root, waiting } = await afterHeadline(slack, run);
      expect(slack.posted).toEqual([
        expect.objectContaining({ threadTs: root.ts, text: "One message, please." }),
      ]);
      const [headlineRow] = await getDb().select().from(exchanges);
      expect(headlineRow).toMatchObject({ outcome: "headline", messageTs: root.ts });

      run.mockResolvedValueOnce(result());
      const reply = message({ thread_ts: root.ts, text: "<@UCOLLEAGUE> it says the certificate expired" });
      await handleMessage(deps, reply);
      expect(run).toHaveBeenCalledTimes(1);
      expect(waiting).toEqual([{ delayMs: HEADLINE_WAIT_MS, task: expect.any(Function) }]);

      await waiting[0]!.task();
      expect(run).toHaveBeenCalledTimes(2);
      expect(run).toHaveBeenLastCalledWith(
        expect.objectContaining({
          question: "<@UCOLLEAGUE> it says the certificate expired",
          inThread: true,
          underHeadline: true,
        }),
      );
      expect(slack.port.threadAuthors).toHaveBeenCalledWith("C0SUPPORT", root.ts);
      expect(slack.posted.at(-1)).toMatchObject({
        threadTs: root.ts,
        text: expect.stringContaining("floor 2"),
      });
    });

    it("ignores other people's replies, and skips a reply when more followed or a colleague replied", async () => {
      const run = vi.fn<NonNullable<HandlerDeps["runPipeline"]>>(async () => headline());
      const first = fakeSlack();
      const { deps, root, waiting } = await afterHeadline(first, run);

      await handleMessage(deps, message({ thread_ts: root.ts, user: "UOTHER", text: "Same here" }));
      expect(waiting).toHaveLength(0);

      const reply = message({ thread_ts: root.ts, text: "It fails" });
      const later = { ts: (Number(reply.ts) + 1).toFixed(6), userId: "UPERSON", fromBot: false };
      const colleague = { ts: reply.ts, userId: "UCOLLEAGUE", fromBot: false };
      for (const authors of [[later], [colleague]]) {
        const slack = fakeSlack(authors);
        await handleMessage({ ...deps, slack: slack.port }, reply);
        await waiting.pop()!.task();
        expect(run).toHaveBeenCalledTimes(1);
        expect(slack.posted).toHaveLength(0);
      }
      // Other bots and the agent itself don't count as a colleague.
      const slack = fakeSlack([
        { ts: reply.ts, userId: BOT, fromBot: true },
        { ts: reply.ts, userId: "UOTHERBOT", fromBot: true },
      ]);
      await handleMessage({ ...deps, slack: slack.port }, reply);
      await waiting.pop()!.task();
      expect(run).toHaveBeenCalledTimes(2);
    });

    it("waits again while the headline is being decided, then answers or drops the reply", async () => {
      for (const decided of ["headline", "silent"] as const) {
        await resetDatabase();
        await getDb().insert(agents).values({ id: AGENT_ID, name: "IT support" });
        const slack = fakeSlack();
        let finish: (value: PipelineResult) => void = () => undefined;
        const run = vi.fn<NonNullable<HandlerDeps["runPipeline"]>>(async () => result());
        run.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
        const waiting: (() => Promise<void>)[] = [];
        const deps: HandlerDeps = {
          db: getDb(),
          slack: slack.port,
          config: () => botConfig(agent({ headlineThreads: true })),
          runPipeline: run,
          later: (_delayMs, task) => waiting.push(task),
        };
        const root = message({ text: "Question about the VPN" });
        const pending = handleMessage(deps, root);
        await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
        // The reply comes, and its wait ends, while the headline is still being decided.
        await handleMessage(deps, message({ thread_ts: root.ts, text: "It fails" }));
        await waiting.shift()!();
        expect(waiting).toHaveLength(1);
        expect(run).toHaveBeenCalledTimes(1);

        finish(result({ outcome: decided, answer: null, sources: [], citedRefs: [] }));
        await pending;
        await waiting.shift()!();
        expect(waiting).toHaveLength(0);
        expect(run).toHaveBeenCalledTimes(decided === "headline" ? 2 : 1);
      }
    });

    it("drops an older reply that waited again once a newer one was answered", async () => {
      let finish: (value: PipelineResult) => void = () => undefined;
      const run = vi.fn<NonNullable<HandlerDeps["runPipeline"]>>(async () => result());
      run.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
      const root = message({ text: "Question about the VPN" });
      const older = message({ thread_ts: root.ts, text: "It fails", ts: (Number(root.ts) + 1).toFixed(6) });
      const newer = message({
        thread_ts: root.ts,
        text: "Since today",
        ts: (Number(root.ts) + 2).toFixed(6),
      });
      const slack = fakeSlack([
        { ts: older.ts, userId: "UPERSON", fromBot: false },
        { ts: newer.ts, userId: "UPERSON", fromBot: false },
      ]);
      const waiting: (() => Promise<void>)[] = [];
      const deps: HandlerDeps = {
        db: getDb(),
        slack: slack.port,
        config: () => botConfig(agent({ headlineThreads: true, followUpsInThreads: true })),
        runPipeline: run,
        later: (_delayMs, task) => waiting.push(task),
        now: () => Number(root.ts) * 1000,
      };
      const pending = handleMessage(deps, root);
      await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
      await handleMessage(deps, older);
      await handleMessage(deps, newer);
      const [olderWait, newerWait] = [waiting.shift()!, waiting.shift()!];
      await olderWait(); // the headline is still pending: the older reply waits again
      expect(waiting).toHaveLength(1);

      finish(headline());
      await pending;
      await newerWait();
      expect(run).toHaveBeenCalledTimes(2);
      await waiting.shift()!(); // now in an answered thread, but the newer reply answered for it
      expect(run).toHaveBeenCalledTimes(2);
      expect(
        slack.posted.filter((post) => post.threadTs === root.ts && post.text.includes("floor 2")),
      ).toHaveLength(1);
    });

    it("leaves replies alone when the agent doesn't wait for requests", async () => {
      const slack = fakeSlack();
      const run = vi.fn<NonNullable<HandlerDeps["runPipeline"]>>(async () => headline());
      const { deps, root, waiting } = await afterHeadline(slack, run);
      const off = { ...deps, config: () => botConfig(agent({ headlineThreads: false })) };
      await handleMessage(off, message({ thread_ts: root.ts, text: "It fails" }));
      expect(waiting).toHaveLength(0);
      expect(run).toHaveBeenCalledTimes(1);
    });
  });

  it("posts the error message, alerts, and records the error", async () => {
    const slack = fakeSlack();
    const alert = vi.fn();
    const run = vi.fn(async () =>
      result({ outcome: "error", error: "The API key was rejected", answer: null }),
    );
    await handleMessage(
      { db: getDb(), slack: slack.port, config: () => botConfig(agent()), runPipeline: run, alert },
      message(),
    );
    expect(slack.posted[0]).toMatchObject({
      text: DEFAULT_APP_SETTINGS.errorMessage,
      autoLinkUrls: true,
    });
    expect(alert).toHaveBeenCalledWith(
      expect.objectContaining({ id: AGENT_ID }),
      "C0SUPPORT",
      "The API key was rejected",
    );
    const [row] = await getDb().select().from(exchanges);
    expect(row).toMatchObject({ outcome: "error", error: "The API key was rejected", answer: null });
  });

  it("stays silent without posting, and keeps no text when retention is 0", async () => {
    const slack = fakeSlack();
    const run = vi.fn(async () => result({ outcome: "silent", answer: null, sources: [], citedRefs: [] }));
    const settings = { ...DEFAULT_APP_SETTINGS, retentionDays: 0, workingReaction: null };
    await handleMessage(
      { db: getDb(), slack: slack.port, config: () => botConfig(agent(), settings), runPipeline: run },
      message(),
    );
    expect(slack.posted).toHaveLength(0);
    expect(slack.reactions).toHaveLength(0);
    const [row] = await getDb().select().from(exchanges);
    expect(row).toMatchObject({ outcome: "silent", question: null, answer: null, reason: null });
  });

  it("does not restore text when maintenance clears an in-flight exchange", async () => {
    const db = getDb();
    const runPipeline = async () => {
      await putSetting(db, "app", { ...DEFAULT_APP_SETTINGS, retentionDays: 0 });
      await runMaintenance(db);
      return result();
    };
    await handleMessage(
      { db, slack: fakeSlack().port, config: () => botConfig(agent()), runPipeline },
      message(),
    );
    const [row] = await db.select().from(exchanges);
    expect(row?.textRemovedAt).toBeInstanceOf(Date);
    expect(row).toMatchObject({
      outcome: "answered",
      question: null,
      answer: null,
      reason: null,
      searchQueries: [],
    });
  });

  it("notes images it could not read", async () => {
    const slack = fakeSlack();
    const run = vi.fn(async () => result());
    await handleMessage(
      { db: getDb(), slack: slack.port, config: () => botConfig(agent()), runPipeline: run },
      message({
        subtype: "file_share",
        files: [{ mimetype: "image/png", size: 10, url_private: "https://files.slack.com/x" }],
      }),
    );
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [],
        imageNote: "The person attached an image that could not be read.",
      }),
    );
  });
});

describe("restarts", () => {
  /** What Slack has of a message: the event's fields, and who wrote after it. */
  const inSlack = (event: MessageEvent, later: ThreadAuthor[] = []): FoundMessage => {
    const { type: _type, channel: _channel, ...fields } = event;
    return { message: fields, later };
  };

  /** An exchange that a bot process took on before `startedAt` and did not finish. */
  async function interrupted(event: MessageEvent, startedAt = new Date()) {
    await getDb()
      .insert(exchanges)
      .values({
        agentId: AGENT_ID,
        agentName: "IT support",
        channelId: event.channel,
        slackUserId: event.user,
        messageTs: event.ts,
        threadTs: event.thread_ts ?? null,
        question: event.text,
        createdAt: new Date(startedAt.getTime() - 5_000),
      });
    const [found] = await findInterrupted(getDb(), startedAt);
    return found!;
  }

  it("takes a message on before it waits in the queue", async () => {
    const slack = fakeSlack();
    const run = vi.fn(async () => result());
    const queued: (() => Promise<void>)[] = [];
    const deps: HandlerDeps = {
      db: getDb(),
      slack: slack.port,
      config: () => botConfig(agent()),
      runPipeline: run,
      queue: (task) => queued.push(task),
    };
    const event = message();
    await handleMessage(deps, event);
    expect(queued).toHaveLength(1);
    expect(run).not.toHaveBeenCalled();
    const [row] = await getDb().select().from(exchanges);
    expect(row).toMatchObject({
      outcome: "pending",
      messageTs: event.ts,
      question: "Which printer can I use?",
    });

    // A redelivered event finds the exchange.
    await handleMessage(deps, event);
    expect(queued).toHaveLength(1);
    await queued[0]!();
    expect(run).toHaveBeenCalledTimes(1);
    expect(slack.posted).toHaveLength(1);
  });

  it("stores the outcome before it posts the reply", async () => {
    const slack = fakeSlack();
    const seen: string[] = [];
    vi.mocked(slack.port.postMessage).mockImplementation(async () => {
      const [row] = await getDb().select().from(exchanges);
      seen.push(row!.outcome);
      return "170000001.000100";
    });
    await handleMessage(
      { db: getDb(), slack: slack.port, config: () => botConfig(agent()), runPipeline: async () => result() },
      message(),
    );
    expect(seen).toEqual(["answered"]);
    const [row] = await getDb().select().from(exchanges);
    expect(row).toMatchObject({ outcome: "answered", answerTs: "170000001.000100" });
    expect(row?.latencyMs).toEqual(expect.any(Number));
  });

  it("records an error when the reply could not be posted", async () => {
    const slack = fakeSlack();
    const alert = vi.fn();
    vi.mocked(slack.port.postMessage).mockRejectedValue(new Error("Could not post the Slack message"));
    await handleMessage(
      {
        db: getDb(),
        slack: slack.port,
        config: () => botConfig(agent()),
        runPipeline: async () => result(),
        alert,
      },
      message(),
    );
    const [row] = await getDb().select().from(exchanges);
    expect(row).toMatchObject({
      outcome: "error",
      error: "Could not post the answer to Slack",
      answerTs: null,
    });
    expect(alert).toHaveBeenCalledWith(
      expect.objectContaining({ id: AGENT_ID }),
      "C0SUPPORT",
      "Could not post the answer to Slack",
    );
  });

  it("finds the pending exchanges of earlier processes that are recent enough", async () => {
    const db = getDb();
    const startedAt = new Date();
    const before = new Date(startedAt.getTime() - 60_000);
    await db.insert(exchanges).values([
      { channelId: "C1", messageTs: "1.1", createdAt: before },
      { channelId: "C1", messageTs: "1.2", threadTs: "1.1", createdAt: before },
      { channelId: "C1", messageTs: "1.3", createdAt: before, outcome: "answered" },
      { channelId: "C1", messageTs: "1.4", createdAt: new Date(startedAt.getTime() - 20 * 60_000) },
      { channelId: "C1", messageTs: "1.5", createdAt: new Date(startedAt.getTime() + 1_000) },
    ]);
    const found = await findInterrupted(db, startedAt);
    expect(found.map(({ messageTs, threadTs }) => ({ messageTs, threadTs }))).toEqual([
      { messageTs: "1.1", threadTs: null },
      { messageTs: "1.2", threadTs: "1.1" },
    ]);
  });

  it("resumes a message that a stopped process took on, once", async () => {
    const event = message({ text: "<@UBOT> Which printer can I use?" });
    const startedAt = new Date();
    const exchange = await interrupted(event, startedAt);
    const slack = fakeSlack([], inSlack(event));
    const run = vi.fn(async () => result());
    const deps: HandlerDeps = {
      db: getDb(),
      slack: slack.port,
      config: () => botConfig(agent()),
      runPipeline: run,
    };
    await resumeExchange(deps, exchange);
    expect(slack.port.findMessage).toHaveBeenCalledWith("C0SUPPORT", event.ts, event.ts);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ question: "Which printer can I use?", mentioned: true }),
    );
    expect(slack.posted).toEqual([expect.objectContaining({ threadTs: event.ts })]);
    const rows = await getDb().select().from(exchanges);
    expect(rows).toEqual([expect.objectContaining({ id: exchange.id, outcome: "answered" })]);
    expect(await findInterrupted(getDb(), startedAt)).toEqual([]);

    // The event itself, redelivered by Slack after the restart, finds the exchange.
    await handleMessage(deps, event);
    expect(run).toHaveBeenCalledTimes(1);
    expect(slack.posted).toHaveLength(1);
  });

  it("lets a resumed reply under a headline wait again", async () => {
    const root = message({ text: "Question about the VPN" });
    await getDb().insert(exchanges).values({
      agentId: AGENT_ID,
      channelId: root.channel,
      slackUserId: root.user,
      messageTs: root.ts,
      outcome: "headline",
    });
    const reply = message({
      thread_ts: root.ts,
      text: "It fails",
      ts: (Number(root.ts) + 1).toFixed(6),
    });
    const exchange = await interrupted(reply, new Date(Date.now() + 2_000));
    const slack = fakeSlack([], inSlack(reply));
    const run = vi.fn(async () => result());
    const waiting: (() => Promise<void>)[] = [];
    const deps: HandlerDeps = {
      db: getDb(),
      slack: slack.port,
      config: () => botConfig(agent({ headlineThreads: true })),
      runPipeline: run,
      later: (_delayMs, task) => waiting.push(task),
    };
    await resumeExchange(deps, exchange);
    expect(slack.port.findMessage).toHaveBeenCalledWith("C0SUPPORT", root.ts, reply.ts);
    expect(waiting).toHaveLength(1);
    expect(run).not.toHaveBeenCalled();
    await waiting[0]!();
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ question: "It fails", underHeadline: true }));
    const [row] = await getDb().select().from(exchanges).where(eq(exchanges.id, exchange.id));
    expect(row?.outcome).toBe("answered");
  });

  it("forgets a waiting reply when the poster wrote more", async () => {
    const root = message({ text: "Question about the VPN" });
    await getDb().insert(exchanges).values({
      agentId: AGENT_ID,
      channelId: root.channel,
      slackUserId: root.user,
      messageTs: root.ts,
      outcome: "headline",
    });
    const reply = message({ thread_ts: root.ts, text: "It fails", ts: (Number(root.ts) + 1).toFixed(6) });
    const later = { ts: (Number(reply.ts) + 1).toFixed(6), userId: "UPERSON", fromBot: false };
    const waiting: (() => Promise<void>)[] = [];
    const deps: HandlerDeps = {
      db: getDb(),
      slack: fakeSlack([later]).port,
      config: () => botConfig(agent({ headlineThreads: true })),
      runPipeline: async () => result(),
      later: (_delayMs, task) => waiting.push(task),
    };
    await handleMessage(deps, reply);
    // While it waits, its exchange is pending: a restart now leaves it to the next process.
    expect(await getDb().select().from(exchanges).where(eq(exchanges.messageTs, reply.ts))).toEqual([
      expect.objectContaining({ outcome: "pending" }),
    ]);
    await waiting[0]!();
    expect(await getDb().select().from(exchanges).where(eq(exchanges.messageTs, reply.ts))).toEqual([]);
  });

  it("forgets an exchange whose message is gone, and leaves one the bot replied to", async () => {
    const run = vi.fn(async () => result());
    const gone = message();
    const deps = (slack: ReturnType<typeof fakeSlack>): HandlerDeps => ({
      db: getDb(),
      slack: slack.port,
      config: () => botConfig(agent()),
      runPipeline: run,
    });
    await resumeExchange(deps(fakeSlack([], null)), await interrupted(gone));
    expect(await getDb().select().from(exchanges)).toEqual([]);

    const replied = message();
    const slack = fakeSlack(
      [],
      inSlack(replied, [{ ts: (Number(replied.ts) + 1).toFixed(6), userId: BOT, fromBot: true }]),
    );
    await resumeExchange(deps(slack), await interrupted(replied));
    expect(run).not.toHaveBeenCalled();
    expect(slack.posted).toHaveLength(0);
    expect(await getDb().select().from(exchanges)).toEqual([expect.objectContaining({ outcome: "pending" })]);
  });
});

describe("handleReaction", () => {
  it("records 👍 and 👎 on the bot's answers", async () => {
    const slack = fakeSlack();
    const config = () => botConfig(agent());
    await handleMessage(
      { db: getDb(), slack: slack.port, config, runPipeline: async () => result() },
      message(),
    );
    const item = { type: "message", channel: "C0SUPPORT", ts: "170000001.000100" };
    await handleReaction(
      { db: getDb(), config },
      { type: "reaction_added", user: "UPERSON", reaction: "+1", item_user: BOT, item },
    );
    expect((await getDb().select().from(exchanges))[0]?.feedback).toBe(1);
    await handleReaction(
      { db: getDb(), config },
      { type: "reaction_added", user: "UPERSON", reaction: "-1", item_user: "UOTHER", item },
    );
    expect((await getDb().select().from(exchanges))[0]?.feedback).toBe(1);
    await handleReaction(
      { db: getDb(), config },
      { type: "reaction_removed", user: "UPERSON", reaction: "+1", item_user: BOT, item },
    );
    expect((await getDb().select().from(exchanges))[0]?.feedback).toBe(0);
  });
});

describe("runMaintenance", () => {
  it("removes texts after the retention period", async () => {
    const db = getDb();
    await putSetting(db, "app", { ...DEFAULT_APP_SETTINGS, retentionDays: 30 });
    const old = new Date(Date.now() - 31 * 24 * 60 * 60_000);
    await db.insert(exchanges).values([
      {
        channelId: "C1",
        messageTs: "1.1",
        question: "old",
        answer: "a",
        reason: "r",
        outcome: "answered",
        createdAt: old,
      },
      { channelId: "C1", messageTs: "1.2", question: "new", answer: "b", outcome: "answered" },
    ]);
    await runMaintenance(db);
    const [oldRow] = await db.select().from(exchanges).where(eq(exchanges.messageTs, "1.1"));
    const [newRow] = await db.select().from(exchanges).where(eq(exchanges.messageTs, "1.2"));
    expect(oldRow).toMatchObject({ question: null, answer: null, reason: null, outcome: "answered" });
    expect(oldRow?.textRemovedAt).not.toBeNull();
    expect(newRow).toMatchObject({ question: "new", answer: "b" });
  });
});
