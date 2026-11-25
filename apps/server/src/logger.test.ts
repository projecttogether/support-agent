import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { serializeError } from "./logger";

describe("serializeError", () => {
  it("keeps the values of a failed query out of the logs", () => {
    const query = 'insert into "exchanges" ("question") values ($1)';
    const cause = Object.assign(new Error('null value in column "agent_name"'), {
      code: "23502",
      detail: "Failing row contains (How do I reset my password?)",
    });
    const logged = serializeError(new DrizzleQueryError(query, ["How do I reset my password?"], cause));

    expect(JSON.stringify(logged)).not.toContain("reset my password");
    expect(logged).toMatchObject({ type: "DrizzleQueryError", query, code: "23502" });
    expect(logged.stack).toMatch(/^\s+at .*logger\.test\.ts/);
  });

  it("keeps lines of a value that look like stack frames out too", () => {
    const question = "Please help\nat my desk\n    at (reset my password)";
    const logged = serializeError(new DrizzleQueryError("select $1", [question], new Error("failed")));

    expect(JSON.stringify(logged)).not.toMatch(/my desk|reset my password/);
  });

  it("logs other errors as before", () => {
    expect(serializeError(new Error("Slack said no"))).toMatchObject({
      type: "Error",
      message: "Slack said no",
    });
  });
});
