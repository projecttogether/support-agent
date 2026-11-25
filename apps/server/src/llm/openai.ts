import OpenAI from "openai";
import {
  MAX_RETRIES,
  REQUEST_TIMEOUT_MS,
  LlmError,
  type ChatResult,
  type JsonRequest,
  type LlmClient,
  type ProviderConnection,
} from "./types";

/**
 * OpenAI, Mistral AI and every other OpenAI-compatible API, through OpenAI's
 * chat completions. Structured output asks for a JSON schema first and falls
 * back to plain JSON mode, then to the prompt alone, for APIs that lack it.
 */
type FormatLevel = "json_schema" | "json_object" | "none";

function toOpenAiMessages(request: JsonRequest): OpenAI.ChatCompletionMessageParam[] {
  const messages: OpenAI.ChatCompletionMessageParam[] = [{ role: "system", content: request.system }];
  for (const message of request.messages) {
    if (message.role === "assistant") {
      messages.push({
        role: "assistant",
        content: message.content.map((part) => (part.type === "text" ? part.text : "")).join(""),
      });
      continue;
    }
    messages.push({
      role: "user",
      content: message.content.map((part): OpenAI.ChatCompletionContentPart =>
        part.type === "text"
          ? { type: "text", text: part.text }
          : {
              type: "image_url",
              image_url: { url: `data:${part.image.mediaType};base64,${part.image.data}` },
            },
      ),
    });
  }
  return messages;
}

export function mapOpenAiError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError)
    return new LlmError("authentication", "The API key was rejected");
  if (error instanceof OpenAI.NotFoundError) return new LlmError("not_found", "The model was not found");
  if (error instanceof OpenAI.RateLimitError)
    return new LlmError("rate_limited", "The provider's rate limit was reached");
  if (error instanceof OpenAI.APIConnectionTimeoutError)
    return new LlmError("timeout", "The provider did not answer in time");
  // Provider errors may quote prompts or credentials. Keep only the status.
  if (error instanceof OpenAI.BadRequestError || error instanceof OpenAI.UnprocessableEntityError)
    return new LlmError("bad_request", `The provider rejected the request (HTTP ${error.status})`);
  if (error instanceof OpenAI.APIConnectionError)
    return new LlmError("unavailable", "Could not reach the provider");
  if (error instanceof OpenAI.APIError)
    return new LlmError("unavailable", `The provider returned an error (${error.status ?? "no status"})`);
  return new LlmError("unavailable", "The model call failed");
}

function isFormatRejection(error: unknown): boolean {
  return (
    (error instanceof OpenAI.BadRequestError || error instanceof OpenAI.UnprocessableEntityError) &&
    /response_format|json_schema|json_object|schema|structured/i.test(error.message)
  );
}

export function openAiClient(connection: ProviderConnection): LlmClient {
  const client = new OpenAI({
    // Self-hosted APIs often take no key; the SDK insists on a value.
    apiKey: connection.apiKey ?? "none",
    baseURL: connection.baseUrl,
    // SDK logs may contain the model prompt or provider response.
    logLevel: "off",
    maxRetries: MAX_RETRIES,
    timeout: REQUEST_TIMEOUT_MS,
  });
  // OpenAI's reasoning models take max_completion_tokens; others keep max_tokens.
  const limit = connection.kind === "openai" ? { max_completion_tokens: 16_000 } : { max_tokens: 4_096 };

  async function create(request: JsonRequest, level: FormatLevel): Promise<ChatResult> {
    const format: OpenAI.ChatCompletionCreateParamsNonStreaming["response_format"] =
      level === "json_schema"
        ? {
            type: "json_schema",
            json_schema: { name: request.schemaName, schema: request.jsonSchema, strict: true },
          }
        : level === "json_object"
          ? { type: "json_object" }
          : undefined;
    const completion = await client.chat.completions.create({
      model: request.model,
      messages: toOpenAiMessages(request),
      ...limit,
      ...(format ? { response_format: format } : {}),
    });
    const choice = completion.choices[0];
    return {
      text: choice?.message.content ?? "",
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
      refused: Boolean(choice?.message.refusal) || choice?.finish_reason === "content_filter",
    };
  }

  return {
    async chatJson(request) {
      const levels: FormatLevel[] = ["json_schema", "json_object", "none"];
      for (const [index, level] of levels.entries()) {
        try {
          return await create(request, level);
        } catch (error) {
          if (index < levels.length - 1 && isFormatRejection(error)) continue;
          throw mapOpenAiError(error);
        }
      }
      throw new LlmError("unavailable", "The model call failed");
    },
    async listModels() {
      try {
        const models: { id: string; name: string | null }[] = [];
        for await (const model of client.models.list()) models.push({ id: model.id, name: null });
        return models.sort((a, b) => a.id.localeCompare(b.id));
      } catch (error) {
        throw mapOpenAiError(error);
      }
    },
  };
}
