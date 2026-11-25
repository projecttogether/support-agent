import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import pg from "pg";
import { eq } from "drizzle-orm";
import { DEFAULT_INSTRUCTIONS } from "@support-agent/shared/api/agents";
import { DEFAULT_SEARCH_API_CONFIG } from "@support-agent/shared/api/knowledge";
import { OPTIONAL_BOT_SCOPES, REQUIRED_BOT_SCOPES } from "@support-agent/shared/api/slack";
import { CONFIG_CHANNEL } from "../core/config-events";
import { encryptSecret } from "../core/crypto";
import { putStoredSlack, storedSlackSchema } from "../core/settings";
import { getDb } from "../db/client";
import { auditLog, knowledgeSources, providers, settings } from "../db/schema";
import { setLlmClientFactoryForTests, type LlmClient } from "../llm";
import { clearTokenCacheForTests } from "../knowledge/search-api";
import { logger } from "../logger";
import { SERVER_ROOT } from "../paths";
import { TEST_DATABASE_URL } from "../test/env";
import { createUser, request, resetDatabase } from "../test/helpers";
import { runCli } from "./main";

// Sign-in is the OIDC provider's job; the page's requests act as a person from the database.
vi.mock("../auth/resolve", async () => {
  const { eq: equals } = await import("drizzle-orm");
  const { users } = await import("../db/schema");
  return {
    resolvePrincipal: async (db: ReturnType<typeof getDb>, headers: Headers) => {
      const id = headers.get("x-test-user");
      if (!id) return null;
      const [user] = await db.select().from(users).where(equals(users.id, id));
      return user?.isActive
        ? { kind: "user", id: user.id, email: user.email, name: user.name, role: user.role, image: null }
        : null;
    },
  };
});

const API_KEY = "sk-cli-provider-key-4f1a";
const OTHER_KEY = "sk-cli-replaced-key-77c2";
const SEARCH_TOKEN = "search-bearer-token-9b3e";
const CLIENT_SECRET = "oauth-client-secret-2d8c";
const BOT_TOKEN = "xoxb-cli-bot-token-6a5f";
const APP_TOKEN = "xapp-cli-app-token-1e7d";
const SECRETS = [API_KEY, OTHER_KEY, SEARCH_TOKEN, CLIENT_SECRET, BOT_TOKEN, APP_TOKEN];
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

/** Everything the command printed in this test, and every log call. */
let printed: string[];

/** Runs `cli <args>` with `stdin` (a JSON value, or text as is). */
async function cli(args: string[], stdin?: unknown) {
  let stdout = "";
  let stderr = "";
  const code = await runCli(args, {
    readStdin: async () =>
      typeof stdin === "string" ? stdin : stdin === undefined ? "" : JSON.stringify(stdin),
    out: (text) => void (stdout += text),
    err: (text) => void (stderr += text),
  });
  printed.push(stdout, stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test output is read loosely
  return { code, stdout, stderr, json: () => JSON.parse(stdout) as any };
}

async function auditEntries(action: string) {
  return getDb().select().from(auditLog).where(eq(auditLog.action, action));
}

/** A model that answers the test call; `fail` makes every call fail. */
function fakeModel(options: { fail?: boolean } = {}) {
  const calls: { apiKey: string | null; model: string }[] = [];
  setLlmClientFactoryForTests((connection): LlmClient => ({
    async chatJson(request) {
      calls.push({ apiKey: connection.apiKey, model: request.model });
      if (options.fail) throw new Error("connection refused");
      return { text: '{"ok": true}', inputTokens: 7, outputTokens: 3, refused: false };
    },
    async listModels() {
      return [{ id: "small-model", name: "Small" }];
    },
  }));
  return calls;
}

type Call = { url: string; authorization: string | null; body: string };

/** Slack's Web API and a search API, by URL. */
function stubFetch(routes: Record<string, () => Response>) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({
      url,
      authorization: new Headers(init?.headers).get("authorization"),
      body: typeof init?.body === "string" ? init.body : "",
    });
    const route = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
    return route ? route[1]() : Response.json({ ok: false, error: "unknown_method" });
  });
  return calls;
}

const slackJson = (data: Record<string, unknown>, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { headers: { "content-type": "application/json", ...headers } });

function stubSlack(scopes: readonly string[] = [...REQUIRED_BOT_SCOPES, ...OPTIONAL_BOT_SCOPES]) {
  return stubFetch({
    "https://slack.com/api/auth.test": () =>
      slackJson(
        {
          ok: true,
          team: "Example",
          team_id: "T0EXAMPLE",
          url: "https://example.slack.com/",
          user: "supportbot",
          user_id: "U0SUPPORT",
        },
        { "x-oauth-scopes": scopes.join(",") },
      ),
    "https://slack.com/api/apps.connections.open": () =>
      slackJson({ ok: true, url: "wss://example.invalid/link" }),
    "https://slack.com/api/conversations.list": () =>
      slackJson({ ok: true, channels: [{ id: "C0HELPDESK1", name: "it-help", is_member: true }] }),
    "https://slack.com/api/conversations.info": () =>
      slackJson({ ok: true, channel: { id: "C0HELPDESK1", name: "it-help" } }),
  });
}

beforeEach(async () => {
  await resetDatabase();
  setLlmClientFactoryForTests(null);
  clearTokenCacheForTests();
  printed = [];
  for (const level of ["trace", "debug", "info", "warn", "error", "fatal"] as const) {
    vi.spyOn(logger, level).mockImplementation((...args: unknown[]) => {
      printed.push(JSON.stringify(args));
    });
  }
});

afterEach(() => {
  // No secret in any output, message or log line of the test.
  for (const text of printed) for (const secret of SECRETS) expect(text).not.toContain(secret);
  setLlmClientFactoryForTests(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("cli settings list", () => {
  it("names every setting and entry, set or not, with hints only", async () => {
    const empty = await cli(["settings", "list"]);
    expect(empty).toMatchObject({ code: 0, stderr: "" });
    expect(empty.stdout).toBe(
      "providers          not set     no providers yet\n" +
        "knowledge-sources  not set     no knowledge sources yet\n" +
        "slack              not set\n" +
        "agents             not set     no agents yet\n" +
        "app                not set     the defaults, keeps texts 90 days, reaction :eyes:\n",
    );

    const provider = (
      await cli(["settings", "apply", "providers"], {
        name: "OpenAI",
        kind: "openai",
        apiKey: API_KEY,
      })
    ).json();
    const json = await cli(["settings", "list", "--json"]);
    expect(JSON.parse(json.stdout)).toEqual([
      {
        name: "providers",
        id: provider.id,
        state: "set",
        hints: ['"OpenAI"', "OpenAI", "default URL", "key …4f1a", "0 agents"],
      },
      { name: "knowledge-sources", id: null, state: "not set", hints: ["no knowledge sources yet"] },
      { name: "slack", id: null, state: "not set", hints: [] },
      { name: "agents", id: null, state: "not set", hints: ["no agents yet"] },
      {
        name: "app",
        id: null,
        state: "not set",
        hints: ["the defaults", "keeps texts 90 days", "reaction :eyes:"],
      },
    ]);
    expect((await cli(["settings", "list"])).stdout).toContain(
      `providers --id ${provider.id}  set         "OpenAI", OpenAI, default URL, key …4f1a, 0 agents\n`,
    );
  });
});

describe("cli settings … providers", () => {
  it("adds, shows, changes, tests and removes a provider as the page does", async () => {
    const created = await cli(["settings", "apply", "providers"], {
      name: "OpenAI",
      kind: "openai",
      apiKey: API_KEY,
    });
    expect(created.code).toBe(0);
    const provider = created.json();
    expect(created.stderr).toBe(`Created. ID: ${provider.id}\n`);
    expect(provider).toMatchObject({
      name: "OpenAI",
      kind: "openai",
      baseUrl: null,
      hasApiKey: true,
      apiKeyHint: "…4f1a",
      agentCount: 0,
    });
    const [row] = await getDb().select().from(providers);
    expect(row?.apiKeyEncrypted).toMatch(/^v1:/);
    expect((await auditEntries("provider.created"))[0]).toMatchObject({
      actorUserId: null,
      actorEmail: "operator",
      entityId: provider.id,
      summary: 'Added provider "OpenAI" (OpenAI) (cli settings apply providers)',
    });

    const shown = await cli(["settings", "show", "providers", "--id", provider.id]);
    expect(shown.stdout).toBe(created.stdout);
    expect((await cli(["settings", "show", "providers"])).json()).toEqual({ items: [provider] });

    // An omitted key keeps the saved one, as on the page.
    const renamed = await cli(["settings", "apply", "providers", "--id", provider.id], {
      name: "OpenAI (IT)",
    });
    expect(renamed).toMatchObject({ code: 0, stderr: "" });
    expect(renamed.json()).toMatchObject({ name: "OpenAI (IT)", apiKeyHint: "…4f1a" });
    const replaced = await cli(["settings", "apply", "providers", "--id", provider.id], {
      apiKey: OTHER_KEY,
    });
    expect(replaced.json()).toMatchObject({ apiKeyHint: "…77c2" });
    expect((await auditEntries("provider.updated")).map((entry) => entry.summary)).toEqual([
      'Changed provider "OpenAI (IT)" (cli settings apply providers)',
      'Changed provider "OpenAI (IT)" (API key replaced) (cli settings apply providers)',
    ]);

    const calls = fakeModel();
    const models = await cli(["settings", "show", "providers", "--id", provider.id, "--models"]);
    expect(models.json()).toEqual({ models: [{ id: "small-model", name: "Small" }] });
    const tested = await cli([
      "settings",
      "test",
      "providers",
      "--id",
      provider.id,
      "--model",
      "small-model",
    ]);
    expect(tested).toMatchObject({ code: 0, stderr: "" });
    expect(tested.json()).toMatchObject({ ok: true, message: "The model answered (10 tokens)" });
    expect(calls.at(-1)).toEqual({ apiKey: OTHER_KEY, model: "small-model" });

    fakeModel({ fail: true });
    const failed = await cli([
      "settings",
      "test",
      "providers",
      "--id",
      provider.id,
      "--model",
      "small-model",
    ]);
    expect(failed.code).toBe(1);
    expect(failed.json()).toMatchObject({ ok: false });
    expect(failed.stderr).toBe(`${failed.json().message}\n`);
    expect((await cli(["settings", "test", "providers", "--id", provider.id])).code).toBe(2);

    const removed = await cli(["settings", "remove", "providers", "--id", provider.id]);
    expect(removed).toMatchObject({ code: 0, stdout: "", stderr: "Removed.\n" });
    expect(await getDb().select().from(providers)).toHaveLength(0);
    expect((await auditEntries("provider.deleted"))[0]).toMatchObject({
      actorEmail: "operator",
      summary: 'Deleted provider "OpenAI (IT)" (cli settings remove providers)',
    });
  });

  it("refuses what the page refuses, with its message, and saves nothing", async () => {
    expect(await cli(["settings", "apply", "providers"], { name: "Mistral", kind: "mistral" })).toMatchObject(
      {
        code: 1,
        stdout: "",
        stderr: "Check the highlighted fields\n  apiKey: Enter an API key\n",
      },
    );
    expect(
      await cli(["settings", "apply", "providers"], { name: "Local", kind: "openai_compatible" }),
    ).toMatchObject({
      code: 1,
      stderr: "Check the highlighted fields\n  baseUrl: Enter the API's base URL\n",
    });
    expect(await getDb().select().from(providers)).toHaveLength(0);

    const provider = (
      await cli(["settings", "apply", "providers"], {
        name: "Mistral",
        kind: "mistral",
        apiKey: API_KEY,
      })
    ).json();
    expect(
      await cli(["settings", "apply", "providers", "--id", provider.id], { apiKey: null }),
    ).toMatchObject({
      code: 1,
      stderr: "This provider needs an API key; enter a new one instead\n",
    });
    for (const command of ["show", "apply", "remove"]) {
      expect(await cli(["settings", command, "providers", "--id", UNKNOWN_ID], {})).toMatchObject({
        code: 1,
        stdout: "",
        stderr: "Provider not found\n",
      });
    }
    expect(await cli(["settings", "show", "providers", "--id", API_KEY])).toMatchObject({
      code: 1,
      stderr: "Not found\n",
    });

    const agent = await cli(["settings", "apply", "agents"], agentBody({ providerId: provider.id }));
    expect(agent.code).toBe(0);
    expect(await cli(["settings", "remove", "providers", "--id", provider.id])).toMatchObject({
      code: 1,
      stderr: 'The agent "IT support" uses this provider. Choose another provider there first.\n',
    });
    expect(await auditEntries("provider.deleted")).toHaveLength(0);
  });
});

describe("cli settings … knowledge-sources", () => {
  const SOURCE = {
    name: "IT handbook",
    description: "Public IT articles",
    kind: "search_api",
    config: { ...DEFAULT_SEARCH_API_CONFIG, url: "https://search.example.org/search" },
  };

  it("adds a source with an encrypted secret, tests it, changes and removes it", async () => {
    const created = await cli(["settings", "apply", "knowledge-sources"], {
      ...SOURCE,
      secret: SEARCH_TOKEN,
    });
    expect(created.code).toBe(0);
    const source = created.json();
    expect(created.stderr).toBe(`Created. ID: ${source.id}\n`);
    expect(source).toMatchObject({ name: "IT handbook", hasSecret: true, agentCount: 0 });
    const [row] = await getDb().select().from(knowledgeSources);
    expect(row?.secretEncrypted).toMatch(/^v1:/);
    expect((await cli(["settings", "list"])).stdout).toContain(
      `knowledge-sources --id ${source.id}  set         "IT handbook", https://search.example.org/search, bearer token, token stored, 0 agents\n`,
    );
    expect((await auditEntries("knowledge_source.created"))[0]).toMatchObject({
      actorEmail: "operator",
      summary: 'Added knowledge source "IT handbook" (cli settings apply knowledge-sources)',
    });

    const calls = stubFetch({
      "https://search.example.org/search": () =>
        Response.json({
          results: [{ title: "VPN", url: "https://it.example.org/vpn", text: "Install it." }],
        }),
    });
    const tested = await cli(["settings", "test", "knowledge-sources", "--id", source.id, "--query", "vpn"]);
    expect(tested).toMatchObject({ code: 0, stderr: "" });
    expect(tested.json()).toMatchObject({
      ok: true,
      message: "1 result",
      results: [{ title: "VPN", url: "https://it.example.org/vpn", text: "Install it.", section: null }],
    });
    expect(calls[0]).toMatchObject({ authorization: `Bearer ${SEARCH_TOKEN}` });
    expect(JSON.parse(calls[0]!.body)).toEqual({ query: "vpn", limit: 6 });

    stubFetch({ "https://search.example.org/search": () => new Response("{}", { status: 401 }) });
    const failed = await cli(["settings", "test", "knowledge-sources", "--id", source.id, "--query", "vpn"]);
    expect(failed.code).toBe(1);
    expect(failed.json()).toMatchObject({ ok: false, results: [] });
    expect((await cli(["settings", "test", "knowledge-sources", "--id", source.id])).code).toBe(2);

    // OAuth 2.0 needs a token URL and a client ID, as on the page.
    const oauth = { ...SOURCE.config, auth: "oauth2_client_credentials" };
    expect(
      await cli(["settings", "apply", "knowledge-sources", "--id", source.id], { config: oauth }),
    ).toMatchObject({
      code: 1,
      stderr:
        "Check the highlighted fields\n  config.tokenUrl: Enter the token URL\n  config.clientId: Enter the client ID\n",
    });
    const changed = await cli(["settings", "apply", "knowledge-sources", "--id", source.id], {
      config: { ...oauth, tokenUrl: "https://login.example.org/token", clientId: "support-agent" },
      secret: CLIENT_SECRET,
    });
    expect(changed.json()).toMatchObject({ config: { auth: "oauth2_client_credentials" }, hasSecret: true });
    expect((await auditEntries("knowledge_source.updated"))[0]).toMatchObject({
      summary:
        'Changed knowledge source "IT handbook" (secret replaced) (cli settings apply knowledge-sources)',
    });
    const cleared = await cli(["settings", "apply", "knowledge-sources", "--id", source.id], {
      secret: null,
    });
    expect(cleared.json()).toMatchObject({ hasSecret: false });
    expect((await cli(["settings", "list"])).stdout).toContain(
      "OAuth 2.0 client credentials, client secret not stored, 0 agents\n",
    );
    expect((await cli(["settings", "list", "--json"])).json()[1]).toMatchObject({ state: "incomplete" });

    expect(await cli(["settings", "remove", "knowledge-sources", "--id", source.id])).toMatchObject({
      code: 0,
      stderr: "Removed.\n",
    });
    expect(await getDb().select().from(knowledgeSources)).toHaveLength(0);
  });
});

describe("cli settings … slack", () => {
  it("saves both tokens, checks them, lists channels and prints the manifest", async () => {
    const calls = stubSlack();
    const applied = await cli(["settings", "apply", "slack"], { botToken: BOT_TOKEN, appToken: APP_TOKEN });
    expect(applied).toMatchObject({ code: 0, stderr: "" });
    expect(applied.json()).toEqual({
      hasBotToken: true,
      hasAppToken: true,
      botTokenHint: "…6a5f",
      appTokenHint: "…1e7d",
      teamId: null,
      teamName: null,
      botUserId: null,
      botName: null,
      missingScopes: [],
      alertChannelId: null,
    });
    const [row] = await getDb().select().from(settings).where(eq(settings.key, "slack"));
    expect(JSON.stringify(row?.value)).toMatch(/"botTokenEncrypted":"v1:/);
    expect(JSON.stringify(row?.value)).toMatch(/"appTokenEncrypted":"v1:/);
    expect((await auditEntries("slack.updated"))[0]).toMatchObject({
      actorEmail: "operator",
      summary: "Changed the Slack connection: bot token, app-level token (cli settings apply slack)",
    });
    expect((await cli(["settings", "show", "slack"])).stdout).toBe(applied.stdout);

    const tested = await cli(["settings", "test", "slack"]);
    expect(tested).toMatchObject({ code: 0, stderr: "" });
    expect(tested.json()).toMatchObject({ ok: true, message: "Connected to Example as supportbot" });
    expect(calls.find((call) => call.url.endsWith("auth.test"))?.authorization).toBe(`Bearer ${BOT_TOKEN}`);
    expect((await cli(["settings", "list"])).stdout).toContain(
      "slack              set         bot token …6a5f, app-level token …1e7d, workspace Example, bot @supportbot\n",
    );

    const channels = await cli(["settings", "show", "slack", "--channels"]);
    expect(channels.json()).toEqual({
      channels: [{ id: "C0HELPDESK1", name: "it-help", isPrivate: false, isMember: true, agentId: null }],
      botName: "supportbot",
    });
    const alerts = await cli(["settings", "apply", "slack"], { alertChannelId: "C0HELPDESK1" });
    expect(alerts.json()).toMatchObject({ alertChannelId: "C0HELPDESK1", botTokenHint: "…6a5f" });

    const manifest = await cli(["settings", "show", "slack", "--manifest", "--name", "IT Help"]);
    expect(manifest.json().manifest).toMatchObject({ display_information: { name: "IT Help" } });
    expect((await cli(["settings", "show", "slack", "--name", "IT Help"])).code).toBe(2);
    expect((await cli(["settings", "show", "slack", "--channels", "--manifest"])).code).toBe(2);
  });

  it("refuses a token the page refuses and fails the check as the page does", async () => {
    expect(await cli(["settings", "test", "slack"])).toMatchObject({
      code: 1,
      stderr: "Enter the bot token first\n",
    });
    expect(await cli(["settings", "apply", "slack"], { botToken: "not-a-bot-token" })).toMatchObject({
      code: 1,
      stderr: "Check the highlighted fields\n  botToken: A bot token starts with xoxb-\n",
    });
    expect(await getDb().select().from(settings)).toHaveLength(0);

    stubSlack(["chat:write"]);
    await cli(["settings", "apply", "slack"], { botToken: BOT_TOKEN });
    expect(await cli(["settings", "test", "slack"])).toMatchObject({
      code: 1,
      stderr: "Enter the app-level token (xapp-…) as well\n",
    });
    await cli(["settings", "apply", "slack"], { appToken: APP_TOKEN });
    const tested = await cli(["settings", "test", "slack"]);
    expect(tested.code).toBe(1);
    expect(tested.stderr).toBe(
      "The bot token lacks scopes: channels:history, channels:read, groups:history, groups:read. Add them and reinstall the app.\n",
    );
    expect((await cli(["settings", "list"])).stdout).toContain(
      "slack              incomplete  bot token …6a5f, app-level token …1e7d, workspace Example, bot @supportbot, missing scopes channels:history channels:read groups:history groups:read\n",
    );
  });

  it("tells the running bot to reload, as a save on the page does", async () => {
    const listener = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await listener.connect();
    try {
      const notified = new Promise<string>((resolve) =>
        listener.once("notification", (message) => resolve(message.channel)),
      );
      await listener.query(`listen ${CONFIG_CHANNEL}`);
      expect((await cli(["settings", "apply", "slack"], { alertChannelId: null })).code).toBe(0);
      expect(await notified).toBe(CONFIG_CHANNEL);
    } finally {
      await listener.end();
    }
  });
});

function agentBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "IT support",
    enabled: false,
    instructions: DEFAULT_INSTRUCTIONS,
    providerId: null,
    model: "",
    fallbackProviderId: null,
    fallbackModel: null,
    replyMode: "questions",
    followUpsInThreads: false,
    noAnswerMode: "escalate",
    escalationMessage: "Ask the IT team in #it.",
    headlineThreads: false,
    headlineMessage: "",
    displayName: null,
    iconUrl: null,
    readImages: true,
    channels: [],
    knowledgeSourceIds: [],
    ...overrides,
  };
}

describe("cli settings … agents", () => {
  it("creates an agent with a provider, a source and a channel, changes it with its version and removes it", async () => {
    stubSlack();
    // The channel's name comes from Slack, as on the page.
    await cli(["settings", "apply", "slack"], { botToken: BOT_TOKEN });
    const provider = (
      await cli(["settings", "apply", "providers"], {
        name: "OpenAI",
        kind: "openai",
        apiKey: API_KEY,
      })
    ).json();
    const source = (
      await cli(["settings", "apply", "knowledge-sources"], {
        name: "IT handbook",
        kind: "search_api",
        config: DEFAULT_SEARCH_API_CONFIG,
        secret: SEARCH_TOKEN,
      })
    ).json();
    const body = agentBody({
      enabled: true,
      providerId: provider.id,
      model: "small-model",
      knowledgeSourceIds: [source.id],
      channels: ["C0HELPDESK1"],
    });
    expect(await cli(["settings", "apply", "agents"], { ...body, channels: [] })).toMatchObject({
      code: 1,
      stderr: "Check the highlighted fields\n  channels: Choose at least one channel\n",
    });
    const created = await cli(["settings", "apply", "agents"], body);
    expect(created.code).toBe(0);
    const agent = created.json();
    expect(created.stderr).toBe(`Created. ID: ${agent.id}\n`);
    expect(agent).toMatchObject({
      name: "IT support",
      enabled: true,
      providerId: provider.id,
      channels: [{ id: "C0HELPDESK1", name: "it-help" }],
      knowledgeSourceIds: [source.id],
      version: 1,
    });
    expect((await cli(["settings", "list"])).stdout).toContain(
      `agents --id ${agent.id}             set         "IT support", on, "OpenAI" small-model, 1 knowledge source, 1 channel\n`,
    );
    expect((await auditEntries("agent.created"))[0]).toMatchObject({
      actorEmail: "operator",
      summary: 'Created agent "IT support" (cli settings apply agents)',
    });

    const updated = await cli(["settings", "apply", "agents", "--id", agent.id], {
      ...body,
      version: agent.version,
      name: "Helpdesk",
    });
    expect(updated.json()).toMatchObject({ name: "Helpdesk", version: 2 });
    expect(
      await cli(["settings", "apply", "agents", "--id", agent.id], { ...body, version: agent.version }),
    ).toMatchObject({ code: 1, stderr: "Someone else changed this agent. Reload to see the changes.\n" });
    // What docs/deployment.md says: start from show, with the channels as IDs.
    const shown = (await cli(["settings", "show", "agents", "--id", agent.id])).json();
    expect((await cli(["settings", "apply", "agents", "--id", agent.id], shown)).code).toBe(1);
    const edited = await cli(["settings", "apply", "agents", "--id", agent.id], {
      ...shown,
      channels: shown.channels.map((channel: { id: string }) => channel.id),
      enabled: false,
    });
    expect(edited.json()).toMatchObject({ enabled: false, version: 3, channels: [{ id: "C0HELPDESK1" }] });
    expect((await cli(["settings", "show", "agents"])).json().items).toHaveLength(1);
    expect((await cli(["settings", "test", "agents", "--id", agent.id])).code).toBe(2);

    expect(await cli(["settings", "remove", "agents", "--id", agent.id])).toMatchObject({ code: 0 });
    expect((await auditEntries("agent.deleted"))[0]).toMatchObject({
      summary: 'Deleted agent "Helpdesk" (cli settings remove agents)',
    });
  });
});

describe("cli settings … app", () => {
  it("saves the Settings page's body and refuses what it refuses", async () => {
    const body = { retentionDays: 30, errorMessage: "Sorry, please ask in #it.", workingReaction: "" };
    const applied = await cli(["settings", "apply", "app"], body);
    expect(applied).toMatchObject({ code: 0, stderr: "" });
    expect(applied.json()).toEqual({ ...body, workingReaction: null });
    expect((await cli(["settings", "show", "app"])).stdout).toBe(applied.stdout);
    expect((await cli(["settings", "list"])).stdout).toContain(
      "app                set         keeps texts 30 days, no reaction\n",
    );
    expect((await auditEntries("settings.updated"))[0]).toMatchObject({
      actorEmail: "operator",
      summary: "Changed the settings (cli settings apply app)",
    });
    expect(await cli(["settings", "apply", "app"], { ...body, retentionDays: -1 })).toMatchObject({
      code: 1,
      stderr: "Check the highlighted fields\n  retentionDays: Too small: expected number to be >=0\n",
    });
    expect((await cli(["settings", "test", "app"])).code).toBe(2);
  });
});

describe("cli usage", () => {
  it("prints help with the commands and setting names", async () => {
    const help = await cli(["help"]);
    expect(help.code).toBe(0);
    for (const text of [
      "cli settings list",
      "cli settings apply <name> [--id <id>]",
      "cli settings remove <name> --id <id>",
      "providers",
      "knowledge-sources",
      "slack",
      "agents",
      "app",
      "deployment.md",
    ]) {
      expect(help.stdout).toContain(text);
    }
    expect(await cli([])).toMatchObject({ code: 2, stdout: "", stderr: help.stdout });
  });

  it("answers 2 for wrong commands and never repeats what was typed", async () => {
    const wrong = [
      ["tokens", "create", "x"],
      ["settings", "rename", "slack"],
      ["settings", "show"],
      ["settings", "show", "keys"],
      ["settings", "show", "slack", "--id", UNKNOWN_ID],
      ["settings", "remove", "slack"],
      ["settings", "remove", "providers"],
      ["settings", "test", "providers", "--model", "m"],
      ["settings", "apply", "slack", BOT_TOKEN],
      ["settings", "apply", "slack", `--token=${BOT_TOKEN}`],
      ["settings", "apply", "slack", `-${BOT_TOKEN}`],
      ["settings", "apply", "providers", "--id"],
      ["settings", "show", "providers", "--models"],
      ["settings", "list", "--json=yes"],
      ["help", "settings"],
      ["--help", `--token=${BOT_TOKEN}`],
    ];
    for (const args of wrong) {
      const result = await cli(args);
      expect({ args, code: result.code, stdout: result.stdout }).toEqual({ args, code: 2, stdout: "" });
      expect(result.stderr).toContain('Run "cli help" for the commands.');
    }
    expect(await cli(["settings", "apply", "slack"], `botToken=${BOT_TOKEN}`)).toMatchObject({
      code: 2,
      stderr: expect.stringContaining("The body on stdin is not JSON."),
    });
    expect(await cli(["settings", "apply", "providers"], "")).toMatchObject({ code: 2 });
    expect(await getDb().select().from(settings)).toHaveLength(0);
    expect(await getDb().select().from(providers)).toHaveLength(0);
  });
});

describe("the admin page and the command", () => {
  it("run the same code: the page saves as the signed-in admin", async () => {
    const admin = await createUser("admin", "ada@example.org");
    const saved = await request("POST", "/api/v1/providers", {
      userId: admin.id,
      body: { name: "Anthropic", kind: "anthropic", apiKey: API_KEY },
    });
    expect(saved.status).toBe(201);
    expect((await cli(["settings", "show", "providers", "--id", saved.body.id])).json()).toEqual(saved.body);
    expect((await auditEntries("provider.created"))[0]).toMatchObject({
      actorUserId: admin.id,
      actorEmail: "ada@example.org",
      summary: 'Added provider "Anthropic" (Anthropic)',
    });
    const refused = await request("PATCH", `/api/v1/providers/${saved.body.id}`, {
      userId: admin.id,
      body: { apiKey: null },
    });
    expect(refused).toEqual({
      status: 409,
      body: {
        error: { code: "conflict", message: "This provider needs an API key; enter a new one instead" },
      },
    });
  });

  it("shows the hints of provider keys only to admins", async () => {
    await cli(["settings", "apply", "providers"], { name: "OpenAI", kind: "openai", apiKey: API_KEY });
    const admin = await createUser("admin");
    const editor = await createUser("editor");
    const forAdmin = await request("GET", "/api/v1/providers", { userId: admin.id });
    expect(forAdmin.body.items[0]).toMatchObject({ hasApiKey: true, apiKeyHint: "…4f1a" });
    const forEditor = await request("GET", "/api/v1/providers", { userId: editor.id });
    expect(forEditor.body.items[0]).toMatchObject({ name: "OpenAI", hasApiKey: true, apiKeyHint: null });
  });
});

/** Runs the command in a process of its own, as the image does. `readAfterMs`: a reader that starts late. */
function runProcess(
  args: string[],
  options: { stdin?: string; env?: Record<string, string>; readAfterMs?: number } = {},
) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", path.join(SERVER_ROOT, "src/cli.ts"), ...args],
      {
        cwd: SERVER_ROOT,
        env: { ...process.env, LOG_LEVEL: "debug", ...options.env },
        timeout: 20_000,
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    if (options.readAfterMs) {
      child.stdout.pause();
      setTimeout(() => child.stdout.resume(), options.readAfterMs);
    }
    child.on("error", reject);
    child.on("close", (code) => {
      printed.push(stdout, stderr);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(options.stdin ?? "");
  });
}

describe("the cli process", () => {
  it("reads the body from stdin, keeps stdout for its output, logs to stderr and exits", async () => {
    const applied = await runProcess(["settings", "apply", "providers"], {
      stdin: JSON.stringify({ name: "OpenAI", kind: "openai", apiKey: API_KEY }),
    });
    expect(applied.code).toBe(0);
    expect(JSON.parse(applied.stdout)).toMatchObject({ apiKeyHint: "…4f1a" });
    expect(applied.stderr).toMatch(/^Created\. ID: [0-9a-f-]{36}\n$/);
    const listed = await runProcess(["settings", "list", "--json"]);
    expect(listed.code).toBe(0);
    expect(JSON.parse(listed.stdout)).toHaveLength(5);
    const refused = await runProcess(["settings", "apply", "app"], { stdin: "{}" });
    expect(refused).toMatchObject({ code: 1, stdout: "" });
    expect(refused.stderr).toContain("retentionDays:");
  });

  it("prints no error text when the database refuses the connection, also with logging on", async () => {
    const refused = await runProcess(["settings", "apply", "slack"], {
      stdin: JSON.stringify({ alertChannelId: null }),
      env: { DATABASE_URL: "postgres://support_agent:db-password-8c1d@127.0.0.1:1/support_agent" },
    });
    // The whole stderr: no log line, no address, no password.
    expect(refused).toEqual({
      code: 1,
      stdout: "",
      stderr: "Something went wrong. Try again. (ECONNREFUSED)\n",
    });
  });

  it("writes all of a long output to a slow reader before it exits", async () => {
    const channels = Array.from({ length: 2000 }, (_, index) => ({
      id: `C${String(index).padStart(8, "0")}`,
      name: `channel-${index}`,
    }));
    const slack = createServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: true, channels }));
    }).listen(0, "127.0.0.1");
    await new Promise((resolve) => slack.once("listening", resolve));
    await putStoredSlack(
      getDb(),
      storedSlackSchema.parse({ botTokenEncrypted: encryptSecret(BOT_TOKEN), botTokenHint: "…6a5f" }),
    );
    try {
      const shown = await runProcess(["settings", "show", "slack", "--channels"], {
        env: { SLACK_API_URL: `http://127.0.0.1:${(slack.address() as AddressInfo).port}/api/` },
        readAfterMs: 1000,
      });
      expect(shown.code).toBe(0);
      expect(shown.stdout.length).toBeGreaterThan(200_000);
      expect((JSON.parse(shown.stdout) as { channels: unknown[] }).channels).toHaveLength(2000);
    } finally {
      slack.close();
    }
  });
});
