import { z } from "zod";
import type { NoAnswerMode, Outcome, ReplyMode, RetrievedSource } from "@support-agent/shared/api/agents";
import {
  generateJson,
  llmClient,
  LlmError,
  type ChatMessage,
  type ContentPart,
  type ImageInput,
  type ProviderConnection,
} from "../llm";
import { searchSource, SearchError, type SourceConnection } from "../knowledge/search-api";
import { logger } from "../logger";
import {
  ANSWER_JSON_SCHEMA,
  answerSystemPrompt,
  conversationBlock,
  sourcesBlock,
  TRIAGE_JSON_SCHEMA,
  triageSystemPrompt,
} from "./prompts";

export type ModelTarget = { connection: ProviderConnection; model: string };

/** An agent with decrypted credentials, as the bot and the test console run it. */
export type AgentRuntime = {
  id: string | null;
  name: string;
  enabled: boolean;
  instructions: string;
  replyMode: ReplyMode;
  followUpsInThreads: boolean;
  noAnswerMode: NoAnswerMode;
  escalationMessage: string;
  headlineThreads: boolean;
  headlineMessage: string;
  displayName: string | null;
  iconUrl: string | null;
  readImages: boolean;
  channelIds: string[];
  main: ModelTarget | null;
  fallback: ModelTarget | null;
  sources: SourceConnection[];
};

export type ThreadMessage = { role: "person" | "agent"; text: string };

export type PipelineInput = {
  agent: AgentRuntime;
  question: string;
  thread: ThreadMessage[];
  images: ImageInput[];
  mentioned: boolean;
  /** E.g. that an attached image could not be read. */
  imageNote?: string | null;
  /** A thread reply, even when its earlier messages are unknown: never a headline. */
  inThread?: boolean;
  /** The poster's reply under their headline: their replies there are one request. */
  underHeadline?: boolean;
};

const UNDER_HEADLINE_NOTE =
  "The thread starts with a headline by this person. Their replies in the thread and the latest message together are their request: decide on and answer them as a whole.";

export type PipelineResult = {
  outcome: Exclude<Outcome, "pending">;
  reason: string | null;
  searchQueries: string[];
  sources: RetrievedSource[];
  citedRefs: string[];
  /** The model's answer in Markdown when the outcome is "answered"; `replyFor` renders the Slack text. */
  answer: string | null;
  provider: string | null;
  model: string | null;
  usedFallback: boolean;
  error: string | null;
  timings: { triageMs: number | null; searchMs: number | null; answerMs: number | null; totalMs: number };
  usage: { inputTokens: number; outputTokens: number };
};

const triageSchema = z.object({
  respond: z.boolean(),
  // Providers without strict structured output may leave it out.
  headline: z.boolean().default(false),
  reason: z.string(),
  searchQueries: z.array(z.string()),
});

const answerSchema = z.object({
  status: z.enum(["answered", "no_answer"]),
  answer: z.string(),
  citedRefs: z.array(z.string()),
});

/** Passages given to the model at most, over all sources and queries. */
const MAX_SOURCES = 12;

/** Calls the main model and, when it fails or refuses, the fallback model. */
class ModelCaller {
  private useFallback = false;
  provider: string | null = null;
  model: string | null = null;
  usedFallback = false;
  inputTokens = 0;
  outputTokens = 0;

  constructor(private readonly agent: AgentRuntime) {}

  async call<T>(
    request: {
      system: string;
      messages: ChatMessage[];
      schemaName: string;
      jsonSchema: Record<string, unknown>;
    },
    schema: z.ZodType<T>,
  ): Promise<T> {
    const targets: { target: ModelTarget; fallback: boolean }[] = [];
    if (this.agent.main && !this.useFallback) targets.push({ target: this.agent.main, fallback: false });
    if (this.agent.fallback) targets.push({ target: this.agent.fallback, fallback: true });
    if (targets.length === 0) throw new LlmError("bad_request", "The agent has no model");
    let lastError: unknown;
    for (const { target, fallback } of targets) {
      try {
        const result = await generateJson(
          llmClient(target.connection),
          { ...request, model: target.model },
          schema,
        );
        this.inputTokens += result.inputTokens;
        this.outputTokens += result.outputTokens;
        this.provider = target.connection.name;
        this.model = target.model;
        if (fallback) {
          this.usedFallback = true;
          this.useFallback = true;
        }
        return result.value;
      } catch (error) {
        lastError = error;
        if (!fallback && this.agent.fallback) {
          logger.warn(
            { agentId: this.agent.id, code: error instanceof LlmError ? error.code : "unknown" },
            "main model failed; trying the fallback model",
          );
        }
      }
    }
    throw lastError;
  }
}

function userMessage(text: string, images: ImageInput[]): ChatMessage {
  const content: ContentPart[] = [{ type: "text", text }];
  for (const image of images) content.push({ type: "image", image });
  return { role: "user", content };
}

/** Runs every query against every source and merges the passages, best ranks first. */
async function search(sources: SourceConnection[], queries: string[]): Promise<RetrievedSource[]> {
  if (sources.length === 0) return [];
  const tasks = sources.flatMap((source) => queries.map((query) => ({ source, query })));
  const settled = await Promise.allSettled(tasks.map(({ source, query }) => searchSource(source, query)));
  const lists: { source: SourceConnection; results: Awaited<ReturnType<typeof searchSource>> }[] = [];
  const failures: string[] = [];
  settled.forEach((result, index) => {
    const task = tasks[index]!;
    if (result.status === "fulfilled") lists.push({ source: task.source, results: result.value });
    else {
      const message = result.reason instanceof SearchError ? result.reason.message : "Search failed";
      failures.push(`${task.source.name}: ${message}`);
    }
  });
  if (lists.length === 0) throw new SearchError([...new Set(failures)].join("; "));
  if (failures.length > 0) logger.warn({ failures: failures.length }, "some knowledge searches failed");
  const merged: RetrievedSource[] = [];
  const seen = new Set<string>();
  const longest = Math.max(...lists.map((list) => list.results.length));
  for (let rank = 0; rank < longest && merged.length < MAX_SOURCES; rank += 1) {
    for (const list of lists) {
      const result = list.results[rank];
      if (!result) continue;
      const key = `${result.url ?? result.title}\n${result.text.slice(0, 200)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ref: `S${merged.length + 1}`, knowledgeSourceName: list.source.name, ...result });
      if (merged.length >= MAX_SOURCES) break;
    }
  }
  return merged;
}

function errorMessage(error: unknown): string {
  if (error instanceof LlmError || error instanceof SearchError) return error.message;
  return "Unexpected error";
}

/**
 * The agent's work on one message: decide whether to answer and what to
 * search for, search the knowledge sources, then answer from what was found.
 */
export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const started = performance.now();
  const caller = new ModelCaller(input.agent);
  const images = input.agent.readImages ? input.images : [];
  const imageNote =
    input.imageNote ??
    (!input.agent.readImages && input.images.length > 0 ? "The person attached an image." : null);
  const note = [imageNote, input.underHeadline ? UNDER_HEADLINE_NOTE : null].filter(Boolean).join("\n");
  const conversation = conversationBlock(input.thread, input.question, input.mentioned, note || null);
  const result: PipelineResult = {
    outcome: "error",
    reason: null,
    searchQueries: [],
    sources: [],
    citedRefs: [],
    answer: null,
    provider: null,
    model: null,
    usedFallback: false,
    error: null,
    timings: { triageMs: null, searchMs: null, answerMs: null, totalMs: 0 },
    usage: { inputTokens: 0, outputTokens: 0 },
  };
  const finish = () => {
    result.provider = caller.provider;
    result.model = caller.model;
    result.usedFallback = caller.usedFallback;
    result.usage = { inputTokens: caller.inputTokens, outputTokens: caller.outputTokens };
    result.timings.totalMs = Math.round(performance.now() - started);
    return result;
  };

  try {
    let stepStarted = performance.now();
    const triage = await caller.call(
      {
        system: triageSystemPrompt(input.agent.instructions),
        messages: [userMessage(conversation, images)],
        schemaName: "triage",
        jsonSchema: TRIAGE_JSON_SCHEMA,
      },
      triageSchema,
    );
    result.timings.triageMs = Math.round(performance.now() - stepStarted);
    result.reason = triage.reason.trim().slice(0, 500) || null;
    if (!triage.respond) {
      // Only a top-level message can be a headline: its thread is where the request follows.
      const topLevel = !input.inThread && input.thread.length === 0;
      const headline = triage.headline && input.agent.headlineThreads && topLevel;
      result.outcome = headline ? "headline" : "silent";
      return finish();
    }

    const queries = triage.searchQueries
      .map((query) => query.trim().slice(0, 500))
      .filter(Boolean)
      .slice(0, 3);
    result.searchQueries = queries.length > 0 ? queries : [input.question.slice(0, 500)];
    stepStarted = performance.now();
    result.sources = await search(input.agent.sources, result.searchQueries);
    result.timings.searchMs = Math.round(performance.now() - stepStarted);

    stepStarted = performance.now();
    const answer = await caller.call(
      {
        system: answerSystemPrompt(input.agent.instructions),
        messages: [userMessage(`${sourcesBlock(result.sources)}\n\n${conversation}`, images)],
        schemaName: "answer",
        jsonSchema: ANSWER_JSON_SCHEMA,
      },
      answerSchema,
    );
    result.timings.answerMs = Math.round(performance.now() - stepStarted);
    const refs = new Set(result.sources.map((source) => source.ref));
    result.citedRefs = [...new Set(answer.citedRefs.map((ref) => ref.trim()))].filter((ref) => refs.has(ref));

    if (answer.status === "answered" && answer.answer.trim() !== "") {
      result.outcome = "answered";
      result.answer = answer.answer;
    } else {
      result.outcome = "no_answer";
      result.citedRefs = [];
    }
    return finish();
  } catch (error) {
    result.outcome = "error";
    result.error = errorMessage(error);
    if (!(error instanceof LlmError) && !(error instanceof SearchError)) {
      logger.error({ err: error, agentId: input.agent.id }, "agent pipeline failed");
    }
    return finish();
  }
}
