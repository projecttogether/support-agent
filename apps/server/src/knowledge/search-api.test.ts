import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SEARCH_API_CONFIG, type SearchApiConfig } from "@support-agent/shared/api/knowledge";
import { clearTokenCacheForTests, mapResults, renderBody, searchSource, SearchError } from "./search-api";

const PT_STYLE: SearchApiConfig = {
  ...DEFAULT_SEARCH_API_CONFIG,
  url: "https://memory.example.org/v1/memory/search",
  auth: "oauth2_client_credentials",
  tokenUrl: "https://login.example.org/token",
  clientId: "support-agent",
  scope: "memory:read",
  bodyTemplate: JSON.stringify({
    query: "{{query}}",
    filters: { source_system: "kb", limit: "{{limit}}" },
    include_sources: true,
  }),
  titlePath: "source.title",
  urlPath: "source.url",
  sectionPath: "heading_path",
  maxResults: 2,
};

describe("renderBody", () => {
  it("replaces placeholders with the query (as text) and the limit (as a number)", () => {
    expect(renderBody(PT_STYLE.bodyTemplate, 'Wi-Fi "guest"', 8)).toEqual({
      query: 'Wi-Fi "guest"',
      filters: { source_system: "kb", limit: 8 },
      include_sources: true,
    });
    expect(renderBody('{"q": "about {{query}}", "n": ["{{limit}}"]}', "x", 3)).toEqual({
      q: "about x",
      n: [3],
    });
  });

  it("keeps questions with $ patterns or placeholders as they are", () => {
    expect(renderBody('{"q": "about {{query}}"}', "costs $& and $' and {{limit}}", 3)).toEqual({
      q: "about costs $& and $' and {{limit}}",
    });
  });
});

describe("mapResults", () => {
  it("reads the configured paths and joins section lists", () => {
    const payload = {
      results: [
        {
          text: "Use the portal.",
          source: { title: "Passwords", url: "https://it.example.org/pw" },
          heading_path: ["Accounts", "Passwords"],
        },
        { text: "", source: { title: "Empty" } },
        { text: "Second", source: { title: "Other", url: "ftp://x" } },
        { text: "Third", source: {} },
      ],
    };
    expect(mapResults(payload, PT_STYLE)).toEqual([
      {
        title: "Passwords",
        url: "https://it.example.org/pw",
        text: "Use the portal.",
        section: "Accounts › Passwords",
      },
      { title: "Other", url: null, text: "Second", section: null },
    ]);
  });

  it("explains a response without the list", () => {
    expect(() => mapResults({ items: [] }, PT_STYLE)).toThrow('The response has no list at "results"');
  });
});

describe("searchSource", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    clearTokenCacheForTests();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("gets a client-credentials token, caches it and renews it after a 401", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "t1", expires_in: 300 }))
      .mockResolvedValueOnce(
        json({ results: [{ text: "A", source: { title: "T", url: "https://x.example.org" } }] }),
      )
      .mockResolvedValueOnce(json({ error: "expired" }, 401))
      .mockResolvedValueOnce(json({ access_token: "t2", expires_in: 300 }))
      .mockResolvedValueOnce(json({ results: [] }));
    const source = { id: "s1", name: "KB", config: PT_STYLE, secret: "client-secret" };
    expect(await searchSource(source, "printer")).toHaveLength(1);
    expect(await searchSource(source, "printer")).toEqual([]);

    const tokenRequest = fetchMock.mock.calls[0]!;
    expect(tokenRequest[0]).toBe("https://login.example.org/token");
    const form = new URLSearchParams(String(tokenRequest[1]!.body));
    expect(Object.fromEntries(form)).toEqual({
      grant_type: "client_credentials",
      client_id: "support-agent",
      client_secret: "client-secret",
      scope: "memory:read",
    });
    const search = fetchMock.mock.calls[1]!;
    expect((search[1]!.headers as Record<string, string>).authorization).toBe("Bearer t1");
    expect(JSON.parse(String(search[1]!.body))).toMatchObject({ query: "printer", filters: { limit: 2 } });
    expect((fetchMock.mock.calls[4]![1]!.headers as Record<string, string>).authorization).toBe("Bearer t2");
  });

  it("sends a bearer token and reports HTTP errors without details", async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: "secret internals" }, 500));
    const source = { id: "s2", name: "KB", config: { ...DEFAULT_SEARCH_API_CONFIG }, secret: "abc" };
    const error = await searchSource(source, "x").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SearchError);
    expect((error as SearchError).message).toBe("The search API answered 500");
    expect((fetchMock.mock.calls[0]![1]!.headers as Record<string, string>).authorization).toBe("Bearer abc");
  });

  it("stops reading a response larger than 5 MB", async () => {
    const endless = new ReadableStream<Uint8Array>({
      pull: (controller) => controller.enqueue(new Uint8Array(1024 * 1024)),
    });
    fetchMock.mockResolvedValueOnce(new Response(endless, { status: 200 }));
    const source = { id: "s3", name: "KB", config: { ...DEFAULT_SEARCH_API_CONFIG }, secret: "abc" };
    await expect(searchSource(source, "x")).rejects.toThrow(
      "The response of the search API is larger than 5 MB",
    );
  });
});
