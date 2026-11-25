import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generateJson, llmClient, LlmError, extractJson } from "./index";

/** A local stand-in for the providers' HTTP APIs that records requests. */
type Handler = (path: string, body: Record<string, unknown>) => { status: number; body: unknown };
let server: Server;
let baseUrl: string;
let handler: Handler;
const requests: { path: string; body: Record<string, unknown>; headers: IncomingMessage["headers"] }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      const body = data ? (JSON.parse(data) as Record<string, unknown>) : {};
      requests.push({ path: req.url ?? "", body, headers: req.headers });
      const reply = handler(req.url ?? "", body);
      res.writeHead(reply.status, { "content-type": "application/json" });
      res.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  requests.length = 0;
});

const schema = z.object({ ok: z.boolean() });
const request = {
  model: "test-model",
  system: "Be brief.",
  messages: [
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: "Hi" },
        { type: "image" as const, image: { mediaType: "image/png" as const, data: "iVBORw0KGgo=" } },
      ],
    },
  ],
  schemaName: "check",
  jsonSchema: {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
    additionalProperties: false,
  },
};

const completion = (content: string) => ({
  id: "c1",
  object: "chat.completion",
  created: 0,
  model: "test-model",
  choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content, refusal: null } }],
  usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
});

describe("OpenAI-compatible adapter", () => {
  it("sends a JSON schema, the system prompt and images", async () => {
    handler = () => ({ status: 200, body: completion('{"ok": true}') });
    const client = llmClient({ kind: "openai", name: "OpenAI", baseUrl: `${baseUrl}/v1`, apiKey: "sk-test" });
    const result = await generateJson(client, request, schema);
    expect(result).toEqual({ value: { ok: true }, inputTokens: 10, outputTokens: 2 });
    const sent = requests[0]!;
    expect(sent.path).toBe("/v1/chat/completions");
    expect(sent.headers.authorization).toBe("Bearer sk-test");
    expect(sent.body).toMatchObject({
      model: "test-model",
      max_completion_tokens: 16000,
      response_format: { type: "json_schema", json_schema: { name: "check", strict: true } },
      messages: [
        { role: "system", content: "Be brief." },
        {
          role: "user",
          content: [
            { type: "text", text: "Hi" },
            { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } },
          ],
        },
      ],
    });
  });

  it("falls back to JSON mode, then to the prompt, when the API rejects structured output", async () => {
    handler = (_path, body) => {
      const format = body.response_format as { type?: string } | undefined;
      if (format)
        return {
          status: 400,
          body: { error: { message: `response_format ${format.type} is not supported` } },
        };
      return { status: 200, body: completion('Sure: ```json\n{"ok": false}\n```') };
    };
    const client = llmClient({
      kind: "openai_compatible",
      name: "vLLM",
      baseUrl: `${baseUrl}/v1`,
      apiKey: null,
    });
    const result = await generateJson(client, request, schema);
    expect(result.value).toEqual({ ok: false });
    expect(
      requests.map((sent) => (sent.body.response_format as { type?: string } | undefined)?.type ?? "none"),
    ).toEqual(["json_schema", "json_object", "none"]);
    expect(requests[0]!.body.max_tokens).toBe(4096);
    expect(requests[0]!.headers.authorization).toBe("Bearer none");
  });

  it("asks once more when the reply does not validate, then gives up", async () => {
    handler = () => ({ status: 200, body: completion('{"ok": "yes"}') });
    const client = llmClient({ kind: "mistral", name: "Mistral", baseUrl: `${baseUrl}/v1`, apiKey: "m" });
    const error = await generateJson(client, request, schema).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).code).toBe("invalid_output");
    expect(requests).toHaveLength(2);
    const retry = requests[1]!.body.messages as { role: string; content: unknown }[];
    expect(retry.at(-2)).toEqual({ role: "assistant", content: '{"ok": "yes"}' });
  });

  it("maps a rejected key to an authentication error", async () => {
    handler = () => ({ status: 401, body: { error: { message: "bad key" } } });
    const client = llmClient({ kind: "openai", name: "OpenAI", baseUrl: `${baseUrl}/v1`, apiKey: "wrong" });
    const error = await generateJson(client, request, schema).catch((caught: unknown) => caught);
    expect((error as LlmError).code).toBe("authentication");
  });
});

describe("Anthropic adapter", () => {
  const message = (text: string, stopReason = "end_turn") => ({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "test-model",
    content: [{ type: "text", text }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 20, output_tokens: 5 },
  });

  it("sends structured output settings and images", async () => {
    handler = () => ({ status: 200, body: message('{"ok": true}') });
    const client = llmClient({ kind: "anthropic", name: "Anthropic", baseUrl, apiKey: "sk-ant-test" });
    const result = await generateJson(client, request, schema);
    expect(result).toEqual({ value: { ok: true }, inputTokens: 20, outputTokens: 5 });
    const sent = requests[0]!;
    expect(sent.path).toBe("/v1/messages");
    // SDK 1.x sends the key as a bearer token.
    expect(sent.headers["x-api-key"] ?? sent.headers.authorization).toMatch(/^(Bearer )?sk-ant-test$/);
    expect(sent.body).toMatchObject({
      model: "test-model",
      max_tokens: 16000,
      system: "Be brief.",
      output_config: { format: { type: "json_schema", schema: request.jsonSchema } },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Hi" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } },
          ],
        },
      ],
    });
    expect(sent.body).not.toHaveProperty("temperature");
  });

  it("reports a refusal", async () => {
    handler = () => ({ status: 200, body: message("", "refusal") });
    const client = llmClient({ kind: "anthropic", name: "Anthropic", baseUrl, apiKey: "k" });
    const error = await generateJson(client, request, schema).catch((caught: unknown) => caught);
    expect((error as LlmError).code).toBe("refused");
  });

  it("retries without structured output when a model lacks it", async () => {
    handler = (_path, body) =>
      body.output_config
        ? {
            status: 400,
            body: {
              type: "error",
              error: { type: "invalid_request_error", message: "output_config.format is not supported" },
            },
          }
        : { status: 200, body: message('{"ok": true}') };
    const client = llmClient({ kind: "anthropic", name: "Anthropic", baseUrl, apiKey: "k" });
    expect((await generateJson(client, request, schema)).value).toEqual({ ok: true });
    expect(requests).toHaveLength(2);
  });
});

it.each(["openai", "anthropic"] as const)("omits private provider details from %s errors", async (kind) => {
  handler = () => ({ status: 400, body: { error: { message: "Echoed private question" } } });
  const client = llmClient({ kind, name: kind, baseUrl, apiKey: "test" });
  await expect(generateJson(client, request, schema)).rejects.toMatchObject({
    code: "bad_request",
    message: "The provider rejected the request (HTTP 400)",
  });
});

it.each(["openai", "anthropic"] as const)("keeps %s SDK debug logging off", async (kind) => {
  handler = () => ({ status: 400, body: { error: { message: "Private model input" } } });
  vi.stubEnv(kind === "openai" ? "OPENAI_LOG" : "ANTHROPIC_LOG", "debug");
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  try {
    const client = llmClient({ kind, name: kind, baseUrl, apiKey: "test" });
    await expect(generateJson(client, request, schema)).rejects.toMatchObject({ code: "bad_request" });
    expect(debug).not.toHaveBeenCalled();
  } finally {
    debug.mockRestore();
    vi.unstubAllEnvs();
  }
});

describe("extractJson", () => {
  it("finds the object in fenced or chatty replies", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Here:\n```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Answer: {"a":3} done')).toEqual({ a: 3 });
    expect(() => extractJson("nothing")).toThrow();
  });
});
