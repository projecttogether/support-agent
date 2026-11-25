import { createHash } from "node:crypto";
import type { SearchApiConfig, SearchResult } from "@support-agent/shared/api/knowledge";
import { readLimited } from "../core/read-limited";

/** A knowledge source as the bot uses it: config plus the decrypted secret. */
export type SourceConnection = {
  id: string;
  name: string;
  config: SearchApiConfig;
  secret: string | null;
};

export class SearchError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "SearchError";
  }
}

const SEARCH_TIMEOUT_MS = 20_000;
const MAX_TEXT_LENGTH = 4_000;
/** Longest response read from a search API or token URL. */
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

/** A JSON response of at most MAX_RESPONSE_BYTES; null when it is not JSON. */
async function readJson(response: Response, what: string): Promise<unknown> {
  const body = await readLimited(response, MAX_RESPONSE_BYTES).catch(() => {
    throw new SearchError(`Could not read the response of the ${what}`);
  });
  if (!body) throw new SearchError(`The response of the ${what} is larger than 5 MB`);
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * The request body: the template's JSON with every string `"{{query}}"`
 * replaced by the query and `"{{limit}}"` by the number of results.
 * Placeholders inside longer strings are replaced as text.
 */
export function renderBody(template: string, query: string, limit: number): unknown {
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") {
      if (value === "{{query}}") return query;
      if (value === "{{limit}}") return limit;
      // A function, so that `$&` and the like in a question stay text, and in
      // one pass, so that a question containing "{{limit}}" stays as it is.
      return value.replace(/\{\{(query|limit)\}\}/g, (_placeholder, name: string) =>
        name === "query" ? query : String(limit),
      );
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(item)]));
    }
    return value;
  };
  return walk(JSON.parse(template));
}

/** Reads `a.b.c` from a JSON value. */
export function readPath(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const key of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function asText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    const parts = value.filter((item) => typeof item === "string" && item.trim() !== "");
    return parts.length > 0 ? parts.join(" › ") : null;
  }
  return null;
}

/** Maps the API's response to passages with the source's paths. */
export function mapResults(payload: unknown, config: SearchApiConfig): SearchResult[] {
  const list = readPath(payload, config.resultsPath);
  if (!Array.isArray(list)) throw new SearchError(`The response has no list at "${config.resultsPath}"`);
  const results: SearchResult[] = [];
  for (const item of list) {
    const text = asText(readPath(item, config.textPath))?.trim();
    if (!text) continue;
    const url = asText(readPath(item, config.urlPath));
    results.push({
      title: asText(readPath(item, config.titlePath))?.trim() || "Untitled",
      url: url && /^https?:\/\//i.test(url) ? url : null,
      text: text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH)}…` : text,
      section: config.sectionPath ? (asText(readPath(item, config.sectionPath)) ?? null) : null,
    });
  }
  return results.slice(0, config.maxResults);
}

// ---------------------------------------------------------------------------
// OAuth 2.0 client credentials, cached per source and credentials
// ---------------------------------------------------------------------------

const tokens = new Map<string, { token: string; expiresAt: number }>();

function tokenKey(source: SourceConnection): string {
  const { tokenUrl, clientId, scope } = source.config;
  return createHash("sha256")
    .update([source.id, tokenUrl, clientId, scope, source.secret].join("\n"))
    .digest("hex");
}

async function accessToken(source: SourceConnection, refresh: boolean): Promise<string> {
  const key = tokenKey(source);
  const cached = tokens.get(key);
  if (!refresh && cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
  const { tokenUrl, clientId, scope } = source.config;
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: clientId ?? "" });
  if (source.secret) body.set("client_secret", source.secret);
  if (scope) body.set("scope", scope);
  let response: Response;
  try {
    response = await fetch(tokenUrl!, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
  } catch {
    throw new SearchError("Could not reach the token URL");
  }
  if (!response.ok) throw new SearchError(`The token URL answered ${response.status}`, response.status);
  const payload = (await readJson(response, "token URL")) as {
    access_token?: unknown;
    expires_in?: unknown;
  } | null;
  if (typeof payload?.access_token !== "string")
    throw new SearchError("The token response has no access_token");
  const lifetime = typeof payload.expires_in === "number" ? payload.expires_in : 300;
  tokens.set(key, { token: payload.access_token, expiresAt: Date.now() + lifetime * 1000 });
  return payload.access_token;
}

async function headers(source: SourceConnection, refresh: boolean): Promise<Record<string, string>> {
  const base = { "content-type": "application/json", accept: "application/json" };
  if (source.config.auth === "bearer" && source.secret)
    return { ...base, authorization: `Bearer ${source.secret}` };
  if (source.config.auth === "oauth2_client_credentials")
    return { ...base, authorization: `Bearer ${await accessToken(source, refresh)}` };
  return base;
}

/** Searches one source. Throws SearchError with a message an admin can act on. */
export async function searchSource(source: SourceConnection, query: string): Promise<SearchResult[]> {
  const body = JSON.stringify(renderBody(source.config.bodyTemplate, query, source.config.maxResults));
  const send = async (refresh: boolean) => {
    try {
      return await fetch(source.config.url, {
        method: "POST",
        headers: await headers(source, refresh),
        body,
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof SearchError) throw error;
      throw new SearchError("Could not reach the search API");
    }
  };
  let response = await send(false);
  // An expired or revoked token: get a new one once.
  if (response.status === 401 && source.config.auth === "oauth2_client_credentials")
    response = await send(true);
  if (!response.ok) throw new SearchError(`The search API answered ${response.status}`, response.status);
  const payload = await readJson(response, "search API");
  if (payload === null) throw new SearchError("The search API did not return JSON");
  return mapResults(payload, source.config);
}

/** Tests only. */
export function clearTokenCacheForTests() {
  tokens.clear();
}
