import * as Sentry from "@sentry/browser";
import { afterAll, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import { reportCaughtError, startErrorReporting } from "./error-reporting";

// Built at runtime, so source lines quoted in a report never contain it.
const PRIVATE = ["ada.moreno", "example.org"].join("@");
const DSN = "https://public@o1.ingest.example.org/1";

const requests: { url: string; body: string }[] = [];
vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string, init: RequestInit) => {
    requests.push({ url: String(url), body: String(init.body) });
    return new Response("{}");
  }),
);

afterAll(async () => {
  await Sentry.close();
  vi.unstubAllGlobals();
});

type Report = Record<string, unknown> & { exception: { values: Record<string, unknown>[] } };

async function reported(): Promise<Report[]> {
  await Sentry.flush(2000);
  return requests.splice(0).flatMap(({ body }) => {
    const lines = body.split("\n");
    return JSON.parse(lines[1]!).type === "event" ? [JSON.parse(lines[2]!)] : [];
  });
}

describe("web app error reports", () => {
  it("stay off without settings from the server", async () => {
    await startErrorReporting(() => "/");
    reportCaughtError(new Error(PRIVATE));
    expect(Sentry.getClient()).toBeUndefined();
    expect(requests).toEqual([]);
  });

  it("report the route and stack, without the address or messages", async () => {
    const meta = document.createElement("meta");
    meta.name = "support-agent-error-reporting";
    meta.content = JSON.stringify({ dsn: DSN, environment: "production" });
    document.head.append(meta);
    window.history.replaceState(null, "", `/conversations?q=${PRIVATE}`);

    const started = startErrorReporting(() => "/agents/$agentId");
    // Caught before the SDK has loaded, e.g. during the first render.
    reportCaughtError(new Error(PRIVATE));
    await started;
    // The server reports its own failures.
    reportCaughtError(new ApiError(500, "internal_error", PRIVATE));

    const [report, ...others] = await reported();
    expect(others).toEqual([]);
    expect(report!.exception.values[0]).toMatchObject({ type: "Error" });
    expect(report!.exception.values[0]).not.toHaveProperty("value");
    expect(report).toMatchObject({
      transaction: "/agents/$agentId",
      environment: "production",
      // Sentry must not store the browser's IP address.
      sdk: { settings: { infer_ip: "never" } },
    });
    for (const field of ["request", "user", "breadcrumbs", "extra"]) expect(report).not.toHaveProperty(field);
    expect(JSON.stringify(report)).not.toContain("ada.moreno");
    expect(vi.mocked(fetch).mock.calls[0]![0]).toMatch(
      /^https:\/\/o1\.ingest\.example\.org\/api\/1\/envelope\//,
    );
  });
});
