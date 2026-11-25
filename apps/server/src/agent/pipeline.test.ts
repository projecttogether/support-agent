import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SEARCH_API_CONFIG } from "@support-agent/shared/api/knowledge";
import {
  setLlmClientFactoryForTests,
  LlmError,
  type ChatResult,
  type JsonRequest,
  type LlmClient,
  type ProviderConnection,
} from "../llm";
import { runPipeline, type AgentRuntime } from "./pipeline";

type Reply = Record<string, unknown> | Error;

/** Fake models: replies by provider name and request schema ("triage" or "answer"). */
function fakeModels(replies: Record<string, { triage?: Reply; answer?: Reply }>) {
  const calls: { provider: string; request: JsonRequest }[] = [];
  setLlmClientFactoryForTests((connection: ProviderConnection): LlmClient => ({
    async chatJson(request): Promise<ChatResult> {
      calls.push({ provider: connection.name, request });
      const reply = replies[connection.name]?.[request.schemaName as "triage" | "answer"];
      if (!reply) throw new LlmError("unavailable", "no reply configured");
      if (reply instanceof Error) throw reply;
      return { text: JSON.stringify(reply), inputTokens: 100, outputTokens: 10, refused: false };
    },
    async listModels() {
      return [];
    },
  }));
  return calls;
}

const connection = (name: string): ProviderConnection => ({
  kind: "openai",
  name,
  baseUrl: null,
  apiKey: "k",
});

function agent(overrides: Partial<AgentRuntime> = {}): AgentRuntime {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "IT support",
    enabled: true,
    instructions: "Answer IT questions.",
    replyMode: "questions",
    followUpsInThreads: false,
    noAnswerMode: "escalate",
    escalationMessage: "Please ask <#C1|it-team> & wait.",
    headlineThreads: true,
    headlineMessage: "Please write the whole request in one message.",
    displayName: null,
    iconUrl: null,
    readImages: true,
    channelIds: ["C123456"],
    main: { connection: connection("Main"), model: "main-model" },
    fallback: null,
    sources: [{ id: "s1", name: "IT KB", config: DEFAULT_SEARCH_API_CONFIG, secret: "t" }],
    ...overrides,
  };
}

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              title: "Reset your password",
              url: "https://it.example.org/password",
              text: "Go to the portal and click Reset.",
            },
            { title: "Wi-Fi", url: "https://it.example.org/wifi", text: "The guest network is Guest." },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  setLlmClientFactoryForTests(null);
});

const input = (overrides: Partial<Parameters<typeof runPipeline>[0]> = {}) => ({
  agent: agent(),
  question: "How do I reset my password?",
  thread: [],
  images: [],
  mentioned: false,
  ...overrides,
});

describe("runPipeline", () => {
  it("stays silent when triage says so, without searching", async () => {
    fakeModels({ Main: { triage: { respond: false, reason: "A thank-you", searchQueries: [] } } });
    const result = await runPipeline(input({ question: "Thanks!" }));
    expect(result).toMatchObject({
      outcome: "silent",
      reason: "A thank-you",
      answer: null,
      model: "main-model",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("takes a top-level message for a headline only when triage says so and the agent waits for requests", async () => {
    const triage = { respond: false, headline: true, reason: "Only a topic", searchQueries: [] };
    fakeModels({ Main: { triage } });
    const question = "Question about the VPN";
    expect(await runPipeline(input({ question }))).toMatchObject({
      outcome: "headline",
      reason: "Only a topic",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      await runPipeline(input({ question, thread: [{ role: "person", text: "Question about the VPN" }] })),
    ).toMatchObject({ outcome: "silent" });
    expect(await runPipeline(input({ question, agent: agent({ headlineThreads: false }) }))).toMatchObject({
      outcome: "silent",
    });
    // A reply whose earlier messages Slack didn't return is still in a thread.
    expect(await runPipeline(input({ question, inThread: true }))).toMatchObject({ outcome: "silent" });
  });

  it("tells the models that the replies under a headline are one request", async () => {
    const calls = fakeModels({ Main: { triage: { respond: false, reason: "Thanks", searchQueries: [] } } });
    await runPipeline(input({ question: "Danke!", inThread: true }));
    await runPipeline(input({ question: "Danke!", inThread: true, underHeadline: true }));
    const prompts = calls.map((call) => JSON.stringify(call.request.messages));
    expect(prompts[0]).not.toContain("headline by this person");
    expect(prompts[1]).toContain("headline by this person");
  });

  it("answers from the sources and keeps only the refs it found", async () => {
    const calls = fakeModels({
      Main: {
        triage: { respond: true, reason: "Password question", searchQueries: ["reset password", " "] },
        answer: {
          status: "answered",
          answer: "Go to the **portal** and click Reset.",
          citedRefs: ["S1", "S9"],
        },
      },
    });
    const result = await runPipeline(input());
    expect(result.outcome).toBe("answered");
    expect(result.searchQueries).toEqual(["reset password"]);
    expect(result.sources.map((source) => source.ref)).toEqual(["S1", "S2"]);
    expect(result.citedRefs).toEqual(["S1"]);
    expect(result.answer).toBe("Go to the **portal** and click Reset.");
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 20 });
    const answerPrompt = calls[1]!.request.messages[0]!.content[0];
    expect(answerPrompt).toMatchObject({ type: "text" });
    expect((answerPrompt as { text: string }).text).toContain(
      '<source ref="S1" title="Reset your password" url="https://it.example.org/password">',
    );
    expect(calls[1]!.request.system).toContain("Answer IT questions.");
  });

  it("reports no answer, citing nothing, when the passages don't answer the question", async () => {
    fakeModels({
      Main: {
        triage: { respond: true, reason: "Question", searchQueries: ["vpn"] },
        answer: { status: "no_answer", answer: "", citedRefs: ["S1"] },
      },
    });
    const result = await runPipeline(input({ question: "How does the VPN work?" }));
    expect(result).toMatchObject({ outcome: "no_answer", answer: null, citedRefs: [] });
  });

  it("uses the fallback model when the main model fails, for the rest of the message", async () => {
    const calls = fakeModels({
      Main: { triage: new LlmError("rate_limited", "The provider's rate limit was reached") },
      Backup: {
        triage: { respond: true, reason: "Question", searchQueries: ["password"] },
        answer: { status: "answered", answer: "Use the portal.", citedRefs: ["S1"] },
      },
    });
    const result = await runPipeline(
      input({ agent: agent({ fallback: { connection: connection("Backup"), model: "backup-model" } }) }),
    );
    expect(result).toMatchObject({
      outcome: "answered",
      usedFallback: true,
      provider: "Backup",
      model: "backup-model",
    });
    expect(calls.map((call) => `${call.provider}:${call.request.schemaName}`)).toEqual([
      "Main:triage",
      "Backup:triage",
      "Backup:answer",
    ]);
  });

  it("reports an error when every knowledge search fails", async () => {
    fakeModels({ Main: { triage: { respond: true, reason: "Question", searchQueries: ["x"] } } });
    fetchMock.mockImplementation(async () => new Response("down", { status: 503 }));
    const result = await runPipeline(input());
    expect(result).toMatchObject({
      outcome: "error",
      error: "IT KB: The search API answered 503",
      answer: null,
    });
  });

  it("reports an error when no model works", async () => {
    fakeModels({ Main: { triage: new LlmError("authentication", "The API key was rejected") } });
    const result = await runPipeline(input());
    expect(result).toMatchObject({ outcome: "error", error: "The API key was rejected" });
  });

  it("passes images only when the agent reads them", async () => {
    const calls = fakeModels({ Main: { triage: { respond: false, reason: "No", searchQueries: [] } } });
    const image = { mediaType: "image/png" as const, data: "AAAA" };
    await runPipeline(input({ images: [image] }));
    expect(calls[0]!.request.messages[0]!.content).toContainEqual({ type: "image", image });
    await runPipeline(input({ images: [image], agent: agent({ readImages: false }) }));
    const second = calls[1]!.request.messages[0]!.content;
    expect(second.some((part) => part.type === "image")).toBe(false);
    expect((second[0] as { text: string }).text).toContain("The person attached an image.");
  });
});
