import Anthropic from "@anthropic-ai/sdk";
import {
  MAX_RETRIES,
  REQUEST_TIMEOUT_MS,
  LlmError,
  type ChatResult,
  type JsonRequest,
  type LlmClient,
  type ProviderConnection,
} from "./types";

/** Room for adaptive thinking plus the answer; only the tokens used are billed. */
const MAX_TOKENS = 16_000;

function toAnthropicMessages(request: JsonRequest): Anthropic.MessageParam[] {
  return request.messages.map((message) => ({
    role: message.role,
    content: message.content.map((part): Anthropic.ContentBlockParam =>
      part.type === "text"
        ? { type: "text", text: part.text }
        : {
            type: "image",
            source: { type: "base64", media_type: part.image.mediaType, data: part.image.data },
          },
    ),
  }));
}

export function mapAnthropicError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError)
    return new LlmError("authentication", "The API key was rejected");
  if (error instanceof Anthropic.NotFoundError) return new LlmError("not_found", "The model was not found");
  if (error instanceof Anthropic.RateLimitError)
    return new LlmError("rate_limited", "The provider's rate limit was reached");
  if (error instanceof Anthropic.APIConnectionTimeoutError)
    return new LlmError("timeout", "The provider did not answer in time");
  // Provider errors may quote prompts or credentials. Keep only the status.
  if (error instanceof Anthropic.BadRequestError)
    return new LlmError("bad_request", `The provider rejected the request (HTTP ${error.status})`);
  if (error instanceof Anthropic.APIConnectionError)
    return new LlmError("unavailable", "Could not reach the provider");
  if (error instanceof Anthropic.APIError)
    return new LlmError("unavailable", `The provider returned an error (${error.status ?? "no status"})`);
  return new LlmError("unavailable", "The model call failed");
}

export function anthropicClient(connection: ProviderConnection): LlmClient {
  const client = new Anthropic({
    // Always explicit, so the SDK never picks up credentials from the environment.
    apiKey: connection.apiKey || "missing-api-key",
    ...(connection.baseUrl ? { baseURL: connection.baseUrl } : {}),
    // SDK logs may contain the model prompt or provider response.
    logLevel: "off",
    maxRetries: MAX_RETRIES,
    timeout: REQUEST_TIMEOUT_MS,
  });

  async function create(request: JsonRequest, structured: boolean): Promise<ChatResult> {
    const response = await client.messages.create({
      model: request.model,
      max_tokens: MAX_TOKENS,
      system: request.system,
      messages: toAnthropicMessages(request),
      ...(structured
        ? { output_config: { format: { type: "json_schema", schema: request.jsonSchema } } }
        : {}),
    });
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    return {
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      refused: response.stop_reason === "refusal",
    };
  }

  return {
    async chatJson(request) {
      try {
        return await create(request, true);
      } catch (error) {
        // Older models have no structured outputs: ask for JSON in the prompt only.
        if (
          error instanceof Anthropic.BadRequestError &&
          /output_config|format|schema/i.test(error.message)
        ) {
          try {
            return await create(request, false);
          } catch (retryError) {
            throw mapAnthropicError(retryError);
          }
        }
        throw mapAnthropicError(error);
      }
    },
    async listModels() {
      try {
        const models: { id: string; name: string | null }[] = [];
        for await (const model of client.models.list({ limit: 100 })) {
          models.push({ id: model.id, name: model.display_name ?? null });
        }
        return models;
      } catch (error) {
        throw mapAnthropicError(error);
      }
    },
  };
}
