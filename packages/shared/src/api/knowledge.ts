import { z } from "zod";
import { checkResultSchema, idSchema, nullableText } from "./common";

/**
 * Where agents find answers. v1 has one kind: a search API over HTTP that
 * takes a query and returns passages with a title and a URL. Access is
 * decided by the API and the credentials of each source: give each source
 * only the access its agents need.
 */
export const KNOWLEDGE_SOURCE_KINDS = ["search_api"] as const;
export const knowledgeSourceKindSchema = z.enum(KNOWLEDGE_SOURCE_KINDS);

export const SEARCH_AUTH_KINDS = ["none", "bearer", "oauth2_client_credentials"] as const;
export const searchAuthKindSchema = z.enum(SEARCH_AUTH_KINDS);
export type SearchAuthKind = z.infer<typeof searchAuthKindSchema>;

/** The request body when none is set: the standard contract (docs/knowledge-sources.md). */
export const DEFAULT_BODY_TEMPLATE = '{\n  "query": "{{query}}",\n  "limit": "{{limit}}"\n}';

/** A dotted path into the JSON response, e.g. `results` or `source.title`. */
const jsonPath = z
  .string()
  .trim()
  .max(200)
  .regex(/^[A-Za-z0-9_$-]+(\.[A-Za-z0-9_$-]+)*$/, "Use names separated by dots, e.g. source.title");

export const searchApiConfigSchema = z
  .object({
    /** POST endpoint of the search. */
    url: z.url({ protocol: /^https?$/ }).max(500),
    auth: searchAuthKindSchema,
    /** OAuth 2.0 client credentials: token endpoint, client ID and scope (the secret is stored separately). */
    tokenUrl: z.preprocess(
      (value) => (value === "" ? null : value),
      z
        .url({ protocol: /^https?$/ })
        .max(500)
        .nullable(),
    ),
    clientId: nullableText(200),
    scope: nullableText(500),
    /**
     * JSON body. Strings `"{{query}}"` and `"{{limit}}"` are replaced with the
     * search query and the number of results (the limit as a number).
     */
    bodyTemplate: z.string().trim().min(2).max(5000),
    resultsPath: jsonPath,
    titlePath: jsonPath,
    urlPath: jsonPath,
    textPath: jsonPath,
    /** Optional: a heading or section, a string or a list of strings. */
    sectionPath: z.preprocess((value) => (value === "" ? null : value), jsonPath.nullable()),
    maxResults: z.number().int().min(1).max(20),
  })
  .superRefine((value, ctx) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value.bodyTemplate);
    } catch {
      ctx.addIssue({ code: "custom", path: ["bodyTemplate"], message: "Must be valid JSON" });
      return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      ctx.addIssue({ code: "custom", path: ["bodyTemplate"], message: "Must be a JSON object" });
    } else if (!value.bodyTemplate.includes("{{query}}")) {
      ctx.addIssue({ code: "custom", path: ["bodyTemplate"], message: 'Must contain "{{query}}"' });
    }
    if (value.auth === "oauth2_client_credentials") {
      if (!value.tokenUrl)
        ctx.addIssue({ code: "custom", path: ["tokenUrl"], message: "Enter the token URL" });
      if (!value.clientId)
        ctx.addIssue({ code: "custom", path: ["clientId"], message: "Enter the client ID" });
    }
  });
export type SearchApiConfig = z.infer<typeof searchApiConfigSchema>;

export const DEFAULT_SEARCH_API_CONFIG: SearchApiConfig = {
  url: "https://search.example.org/search",
  auth: "bearer",
  tokenUrl: null,
  clientId: null,
  scope: null,
  bodyTemplate: DEFAULT_BODY_TEMPLATE,
  resultsPath: "results",
  titlePath: "title",
  urlPath: "url",
  textPath: "text",
  sectionPath: null,
  maxResults: 6,
};

export const knowledgeSourceSchema = z.object({
  id: idSchema,
  name: z.string(),
  /** For admins: what the source contains and who may see it. */
  description: z.string().nullable(),
  kind: knowledgeSourceKindSchema,
  config: searchApiConfigSchema,
  /** A bearer token or client secret is stored (never returned). */
  hasSecret: z.boolean(),
  agentCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;

export const knowledgeSourceCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: nullableText(1000).optional(),
  kind: knowledgeSourceKindSchema,
  config: searchApiConfigSchema,
  /** Write-only: bearer token or OAuth client secret. */
  secret: nullableText(4000).optional(),
});
export type KnowledgeSourceCreate = z.infer<typeof knowledgeSourceCreateSchema>;

/** Omitted fields stay; `secret` replaces the stored secret, `null` removes it. */
export const knowledgeSourceUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: nullableText(1000).optional(),
  config: searchApiConfigSchema.optional(),
  secret: nullableText(4000).optional(),
});
export type KnowledgeSourceUpdate = z.infer<typeof knowledgeSourceUpdateSchema>;

export const searchResultSchema = z.object({
  title: z.string(),
  url: z.string().nullable(),
  text: z.string(),
  section: z.string().nullable(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const knowledgeTestInputSchema = z.object({ query: z.string().trim().min(1).max(500) });
export const knowledgeTestResultSchema = checkResultSchema.extend({
  results: z.array(searchResultSchema),
});
export type KnowledgeTestResult = z.infer<typeof knowledgeTestResultSchema>;
