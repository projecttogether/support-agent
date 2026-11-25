import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../db/client";
import { sessions, users } from "../db/schema";
import { createApp } from "../http/app";
import { createUser, resetDatabase } from "../test/helpers";

const ISSUER = process.env.OIDC_ISSUER!;
const ORIGIN = "http://localhost:3000";

/** An OpenID Connect provider that signs in the person with `email`. */
function stubProvider(email: string) {
  const json = (body: unknown) => Response.json(body);
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith("/.well-known/openid-configuration")) {
      return json({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/auth`,
        token_endpoint: `${ISSUER}/token`,
        userinfo_endpoint: `${ISSUER}/userinfo`,
      });
    }
    if (url === `${ISSUER}/token`) return json({ access_token: "access", token_type: "Bearer" });
    if (url === `${ISSUER}/userinfo`)
      return json({ id: email, sub: email, email, email_verified: true, name: "A" });
    return new Response(null, { status: 404 });
  });
}

/** The sign-in through the provider; returns where the callback sends the browser. */
async function signIn(body: Record<string, unknown>): Promise<string> {
  const app = createApp();
  const start = await app.request("/api/auth/sign-in/social", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ provider: "oidc", callbackURL: "/", errorCallbackURL: "/sign-in", ...body }),
  });
  expect(start.status).toBe(200);
  const { url } = (await start.json()) as { url: string };
  const cookie = start.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const state = new URL(url).searchParams.get("state")!;
  const callback = await app.request(
    `/api/auth/callback/oidc?code=code&state=${encodeURIComponent(state)}&iss=${encodeURIComponent(ISSUER)}`,
    { headers: { cookie } },
  );
  return callback.headers.get("location") ?? "";
}

beforeEach(resetDatabase);
afterEach(() => vi.unstubAllGlobals());

describe("sign-in", () => {
  it("lets in a person an admin added", async () => {
    await createUser("editor", "eddie@example.org");
    stubProvider("eddie@example.org");
    expect(await signIn({})).toBe("/");
    expect(await getDb().select().from(sessions)).toHaveLength(1);
  });

  it("refuses a person nobody added, also when the request asks to sign up", async () => {
    stubProvider("olga@example.org");
    expect(await signIn({ requestSignUp: true })).toContain("error=signup_disabled");
    expect(await getDb().select().from(users)).toHaveLength(0);
    expect(await getDb().select().from(sessions)).toHaveLength(0);
  });
});
