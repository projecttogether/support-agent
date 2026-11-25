import type { ProviderKind } from "@support-agent/shared/api/providers";

export type ImageInput = { mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; data: string };

export type ContentPart = { type: "text"; text: string } | { type: "image"; image: ImageInput };

export type ChatMessage = { role: "user" | "assistant"; content: ContentPart[] };

export type JsonRequest = {
  model: string;
  system: string;
  messages: ChatMessage[];
  /** Name and JSON schema of the expected object (all properties required, no extra properties). */
  schemaName: string;
  jsonSchema: Record<string, unknown>;
};

export type ChatResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** The model declined (safety). */
  refused: boolean;
};

export type ProviderConnection = {
  kind: ProviderKind;
  name: string;
  baseUrl: string | null;
  apiKey: string | null;
};

/** One provider API. Implementations never log keys or message texts. */
export interface LlmClient {
  chatJson(request: JsonRequest): Promise<ChatResult>;
  listModels(): Promise<{ id: string; name: string | null }[]>;
}

/** Why a model call failed, in words an admin can act on. Never contains secrets. */
export class LlmError extends Error {
  constructor(
    readonly code:
      | "authentication"
      | "rate_limited"
      | "unavailable"
      | "bad_request"
      | "not_found"
      | "refused"
      | "invalid_output"
      | "timeout",
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/** Timeout of one model request, and how often the SDK retries it. */
export const REQUEST_TIMEOUT_MS = 60_000;
export const MAX_RETRIES = 1;
