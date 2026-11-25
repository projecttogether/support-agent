import { afterEach, describe, expect, it, vi } from "vitest";
import { OPTIONAL_BOT_SCOPES, REQUIRED_BOT_SCOPES } from "@support-agent/shared/api/slack";
import { logger } from "../logger";
import { checkSlackTokens, slackLogger } from "./web";

const BOT_TOKEN = "xoxb-1-test";
const APP_TOKEN = "xapp-1-A1-1-test";

/**
 * Slack's Web API as documented: apps.connections.open takes the app-level
 * token only in the Authorization header; a token in the body is an error.
 */
function fakeSlack(appTokenError?: string): typeof fetch {
  return async (input, init) => {
    const method = String(input).split("/").pop();
    const json = (data: unknown, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(data), { headers: { "content-type": "application/json", ...headers } });
    if (method === "auth.test") {
      return json(
        {
          ok: true,
          team: "Example",
          team_id: "T1",
          url: "https://example.slack.com/",
          user: "supportbot",
          user_id: "U1",
        },
        { "x-oauth-scopes": REQUIRED_BOT_SCOPES.join(",") },
      );
    }
    if (method === "apps.connections.open") {
      if (appTokenError) return json({ ok: false, error: appTokenError });
      const header = new Headers(init?.headers).get("authorization");
      const body = new URLSearchParams(typeof init?.body === "string" ? init.body : "");
      return header === `Bearer ${APP_TOKEN}` && !body.has("token")
        ? json({ ok: true, url: "wss://example.invalid/link" })
        : json({ ok: false, error: "invalid_auth" });
    }
    return json({ ok: false, error: "unknown_method" });
  };
}

describe("checkSlackTokens", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("checks the app-level token the way Slack accepts it, in the Authorization header only", async () => {
    vi.stubGlobal("fetch", vi.fn(fakeSlack()));
    const check = await checkSlackTokens(BOT_TOKEN, APP_TOKEN);
    expect(check).toMatchObject({
      ok: true,
      message: "Connected to Example as supportbot",
      missingScopes: [],
    });
    // Optional scopes are listed, but they do not fail the check.
    expect(check.missingOptionalScopes).toEqual([...OPTIONAL_BOT_SCOPES]);
  });

  it("does not show unexpected error text from the Slack response", async () => {
    vi.stubGlobal("fetch", vi.fn(fakeSlack("Unexpected private response")));
    const check = await checkSlackTokens(BOT_TOKEN, APP_TOKEN);
    expect(check).toMatchObject({
      ok: false,
      message: "The app-level token does not work (request_failed). Is Socket Mode turned on?",
    });
  });

  it.each([
    ["invalid_auth", "Slack rejected the app-level token (invalid_auth)"],
    ["token_revoked", "Slack rejected the app-level token (token_revoked)"],
    ["not_allowed_token_type", "This is not an app-level token"],
    ["missing_scope", "lacks the connections:write scope"],
    ["internal_error", "does not work (internal_error). Is Socket Mode turned on?"],
  ])("names the problem when Slack answers %s", async (code, message) => {
    vi.stubGlobal("fetch", vi.fn(fakeSlack(code)));
    const check = await checkSlackTokens(BOT_TOKEN, APP_TOKEN);
    expect(check.ok).toBe(false);
    expect(check.message).toContain(message);
    // The bot token worked, so the workspace is still shown.
    expect(check.teamName).toBe("Example");
  });
});

it("keeps arbitrary SDK warning text out of application logs", () => {
  const child = logger.child<string>({ component: "slack-web" });
  const warn = vi.spyOn(child, "warn").mockImplementation(() => {});
  const childLogger = vi.spyOn(logger, "child").mockReturnValue(child);
  try {
    slackLogger("slack-web").warn("Unexpected private response");
    expect(warn).toHaveBeenCalledExactlyOnceWith("Slack SDK warning");
  } finally {
    childLogger.mockRestore();
    warn.mockRestore();
  }
});
