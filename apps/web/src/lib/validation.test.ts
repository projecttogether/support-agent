import { describe, expect, it } from "vitest";
import { issueMessage, translateMessage } from "./validation";

describe("validation messages", () => {
  it("translates the shared schemas' messages", () => {
    expect(translateMessage("Choose a provider", "de")).toBe("Wähle einen Anbieter");
    expect(translateMessage("Choose a provider", "en")).toBe("Choose a provider");
    expect(translateMessage("A message from the server", "de")).toBe("A message from the server");
  });

  it("replaces zod's own messages with plain ones", () => {
    expect(issueMessage({ code: "too_small", origin: "string", minimum: 1 }, "en")).toBe("Required");
    expect(issueMessage({ code: "too_big", origin: "string", maximum: 80 }, "de")).toBe(
      "Höchstens 80 Zeichen",
    );
    expect(issueMessage({ code: "too_big", origin: "number", maximum: 20 }, "en")).toBe("At most 20");
    expect(issueMessage({ code: "invalid_format", format: "url" }, "en")).toMatch(/^Enter a full address/);
    expect(issueMessage({ code: "invalid_type", expected: "number", input: Number.NaN }, "en")).toBe(
      "Enter a number",
    );
  });
});
