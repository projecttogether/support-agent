import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isOperator, operator } from "../auth/principal";

const SRC = path.resolve(import.meta.dirname, "..");

describe("the operator", () => {
  it("is created only by the command line, never by a route", () => {
    const callers = readdirSync(SRC, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      // A call, or an import of operator (also under another name).
      .filter((file) =>
        /\boperator\(|import\s*\{[^}]*\boperator\b[^}]*\}\s*from\s*"[^"]*auth\/principal"/.test(
          readFileSync(path.join(SRC, file), "utf8"),
        ),
      )
      .filter((file) => file !== path.join("auth", "principal.ts"));
    expect(callers.length).toBeGreaterThan(0);
    expect(
      callers.every((file) => file === "cli.ts" || file.startsWith(`cli${path.sep}`)),
      callers.join(),
    ).toBe(true);
  });

  it("does not survive JSON, so no request body can stand for it", () => {
    expect(isOperator(operator("cli settings apply slack"))).toBe(true);
    expect(isOperator(JSON.parse(JSON.stringify(operator("cli settings apply slack"))))).toBe(false);
    expect(isOperator({ kind: "operator", command: "cli settings apply slack" })).toBe(false);
  });
});
