import { z } from "zod";
import { idSchema, nullableText } from "./common";

/**
 * Model providers. `openai_compatible` covers every other API that speaks
 * OpenAI's chat completions (Azure OpenAI, a self-hosted vLLM, Ollama, …).
 */
export const PROVIDER_KINDS = ["anthropic", "openai", "mistral", "openai_compatible"] as const;
export const providerKindSchema = z.enum(PROVIDER_KINDS);
export type ProviderKind = z.infer<typeof providerKindSchema>;

export const PROVIDER_LABELS: Record<ProviderKind, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  mistral: "Mistral AI",
  openai_compatible: "OpenAI-compatible API",
};

/** Default API base URLs; `openai_compatible` has none and needs one. */
export const PROVIDER_DEFAULT_BASE_URLS: Record<ProviderKind, string | null> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
  mistral: "https://api.mistral.ai/v1",
  openai_compatible: null,
};

export const providerSchema = z.object({
  id: idSchema,
  name: z.string(),
  kind: providerKindSchema,
  /** Null: the provider's default. */
  baseUrl: z.string().nullable(),
  hasApiKey: z.boolean(),
  /** The last four characters of the stored key, e.g. "…3f9a". */
  apiKeyHint: z.string().nullable(),
  /** Agents that use this provider (as main or fallback model). */
  agentCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Provider = z.infer<typeof providerSchema>;

const baseUrlInput = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z
    .url({ protocol: /^https?$/ })
    .max(500)
    .nullable(),
);

export const providerCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: providerKindSchema,
    baseUrl: baseUrlInput.optional(),
    /** Write-only. */
    apiKey: nullableText(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "openai_compatible" && !value.baseUrl) {
      ctx.addIssue({ code: "custom", path: ["baseUrl"], message: "Enter the API's base URL" });
    }
    if (value.kind !== "openai_compatible" && !value.apiKey) {
      ctx.addIssue({ code: "custom", path: ["apiKey"], message: "Enter an API key" });
    }
  });
export type ProviderCreate = z.infer<typeof providerCreateSchema>;

/** Omitted fields stay as they are; `apiKey` replaces the stored key, `null` removes it. */
export const providerUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  baseUrl: baseUrlInput.optional(),
  apiKey: nullableText(1000).optional(),
});
export type ProviderUpdate = z.infer<typeof providerUpdateSchema>;

export const providerModelsSchema = z.object({
  models: z.array(z.object({ id: z.string(), name: z.string().nullable() })),
});
export type ProviderModels = z.infer<typeof providerModelsSchema>;

export const providerTestInputSchema = z.object({ model: z.string().trim().min(1).max(200) });
