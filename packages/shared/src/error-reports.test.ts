import { describe, expect, it } from "vitest";
import { redactErrorReport } from "./error-reports";

const PRIVATE = "ada.moreno@example.org";

describe("redactErrorReport", () => {
  it("keeps the error type, code locations and context but no data", () => {
    const report = redactErrorReport({
      event_id: "abc",
      environment: "production",
      transaction: "GET /api/v1/contacts/:id",
      tags: { role: "web" },
      sdk: { name: "sentry.javascript.browser", settings: { infer_ip: "never" } },
      message: `Contact ${PRIVATE} not found`,
      request: { url: `https://support.example.org/agents?q=${PRIVATE}`, headers: { cookie: "session" } },
      user: { email: PRIVATE },
      extra: { email: PRIVATE },
      breadcrumbs: [{ message: PRIVATE }],
      modules: { pino: "10.4.0" },
      contexts: {
        os: { name: "Linux" },
        runtime: { name: "node" },
        trace: { trace_id: "t" },
        app: { app_memory: 1 },
        react: { componentStack: PRIVATE },
      },
      exception: {
        values: [
          {
            type: "Error",
            value: `duplicate key value: (email)=(${PRIVATE})`,
            mechanism: { type: "generic", handled: true },
            stacktrace: {
              frames: [
                {
                  filename: "/app/apps/server/dist/main.mjs",
                  function: "createContact",
                  lineno: 10,
                  colno: 5,
                  in_app: true,
                  context_line: "  throw error;",
                  vars: { email: PRIVATE },
                },
              ],
            },
          },
        ],
      },
    });
    expect(report).toEqual({
      event_id: "abc",
      environment: "production",
      transaction: "GET /api/v1/contacts/:id",
      tags: { role: "web" },
      sdk: { name: "sentry.javascript.browser", settings: { infer_ip: "never" } },
      contexts: { os: { name: "Linux" }, runtime: { name: "node" }, trace: { trace_id: "t" } },
      exception: {
        values: [
          {
            type: "Error",
            mechanism: { type: "generic", handled: true },
            stacktrace: {
              frames: [
                {
                  filename: "/app/apps/server/dist/main.mjs",
                  function: "createContact",
                  lineno: 10,
                  colno: 5,
                  in_app: true,
                  context_line: "  throw error;",
                },
              ],
            },
          },
        ],
      },
    });
  });

  it("keeps only script files of web addresses in frames", () => {
    const frame = (filename: string) => ({
      exception: { values: [{ stacktrace: { frames: [{ filename }] } }] },
    });
    const filenameOf = (report: ReturnType<typeof frame>) =>
      report.exception.values[0]!.stacktrace.frames[0]!.filename;
    expect(filenameOf(redactErrorReport(frame("https://support.example.org/assets/index-a1.js?v=2#x")))).toBe(
      "https://support.example.org/assets/index-a1.js",
    );
    expect(filenameOf(redactErrorReport(frame(`https://support.example.org/agents?q=${PRIVATE}`)))).toBe(
      "https://support.example.org",
    );
    expect(filenameOf(redactErrorReport(frame("https://support.example.org/invite/secret-token")))).toBe(
      "https://support.example.org",
    );
    expect(filenameOf(redactErrorReport(frame("/app/apps/server/dist/main.mjs")))).toBe(
      "/app/apps/server/dist/main.mjs",
    );
  });

  it("keeps the debug IDs that link bundles to their source maps", () => {
    const report = redactErrorReport({
      debug_meta: {
        sdk_info: { sdk_name: "x" },
        images: [
          { type: "sourcemap", code_file: "/app/apps/server/dist/main.mjs", debug_id: "d-1", extra: PRIVATE },
          {
            type: "sourcemap",
            code_file: `https://support.example.org/assets/index-a1.js?q=${PRIVATE}`,
            debug_id: "d-2",
          },
        ],
      },
    });
    expect(report).toEqual({
      debug_meta: {
        images: [
          { type: "sourcemap", code_file: "/app/apps/server/dist/main.mjs", debug_id: "d-1" },
          { type: "sourcemap", code_file: "https://support.example.org/assets/index-a1.js", debug_id: "d-2" },
        ],
      },
    });
  });

  it("keeps the log message with its ids and codes", () => {
    const report = redactErrorReport({
      message: "job failed permanently",
      contexts: {
        pino: {
          msg: "job failed permanently",
          task: "send_mailing",
          jobId: "42",
          requestId: "r-1",
          route: "POST /api/v1/mailings/:id/send",
          code: "23505",
          path: `/public/unsubscribe/${PRIVATE}`,
          issues: [{ received: PRIVATE }],
        },
      },
    });
    expect(report).toEqual({
      message: "job failed permanently",
      contexts: {
        pino: {
          msg: "job failed permanently",
          task: "send_mailing",
          jobId: "42",
          requestId: "r-1",
          route: "POST /api/v1/mailings/:id/send",
          code: "23505",
        },
      },
    });
  });
});
