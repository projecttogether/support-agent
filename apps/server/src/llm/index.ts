import { z } from "zod";
import { PROVIDER_DEFAULT_BASE_URLS } from "@support-agent/shared/api/providers";
import { anthropicClient } from "./anthropic";
import { openAiClient } from "./openai";
import {
  LlmError,
  type ChatMessage,
  type ChatResult,
  type JsonRequest,
  type LlmClient,
  type ProviderConnection,
} from "./types";

export * from "./types";

function defaultFactory(connection: ProviderConnection): LlmClient {
  if (connection.kind === "anthropic") return anthropicClient(connection);
  const baseUrl = connection.baseUrl ?? PROVIDER_DEFAULT_BASE_URLS[connection.kind];
  if (!baseUrl) throw new LlmError("bad_request", "The provider has no base URL");
  return openAiClient({ ...connection, baseUrl });
}

let factory = defaultFactory;

export function llmClient(connection: ProviderConnection): LlmClient {
  return factory(connection);
}

/** Tests only: replace the provider clients; null restores the real ones. */
export function setLlmClientFactoryForTests(next: ((connection: ProviderConnection) => LlmClient) | null) {
  factory = next ?? defaultFactory;
}

/** Takes the JSON object out of a model reply (also inside ``` fences or surrounding text). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error("No JSON object in the reply");
  }
}

export type JsonResult<T> = { value: T; inputTokens: number; outputTokens: number };

/**
 * Asks for a JSON object and validates it with `schema`. A reply that does
 * not parse or validate gets one correction round; then it fails.
 */
export async function generateJson<T>(
  client: LlmClient,
  request: Omit<JsonRequest, "jsonSchema"> & { jsonSchema?: Record<string, unknown> },
  schema: z.ZodType<T>,
): Promise<JsonResult<T>> {
  const jsonSchema =
    request.jsonSchema ?? (z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>);
  let messages: ChatMessage[] = request.messages;
  let inputTokens = 0;
  let outputTokens = 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result: ChatResult = await client.chatJson({ ...request, jsonSchema, messages });
    inputTokens += result.inputTokens;
    outputTokens += result.outputTokens;
    if (result.refused) throw new LlmError("refused", "The model declined to answer");
    let problem: string;
    try {
      const parsed = schema.safeParse(extractJson(result.text));
      if (parsed.success) return { value: parsed.data, inputTokens, outputTokens };
      problem = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    } catch {
      problem = "the reply was not a JSON object";
    }
    messages = [
      ...request.messages,
      { role: "assistant", content: [{ type: "text", text: result.text.slice(0, 4000) || "(empty)" }] },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Your reply could not be used (${problem}). Reply with only a JSON object that matches this schema:\n${JSON.stringify(jsonSchema)}`,
          },
        ],
      },
    ];
  }
  throw new LlmError("invalid_output", "The model did not return a usable answer");
}
