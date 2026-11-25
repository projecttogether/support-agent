import { describe, expect, it } from "vitest";
import { safeRedirect } from "./sign-in";

describe("safeRedirect", () => {
  it("keeps paths of this app", () => {
    expect(safeRedirect("/agents/1?tab=tests#top")).toBe("/agents/1?tab=tests#top");
    expect(safeRedirect(undefined)).toBe("/");
  });

  it("refuses other sites, however they are written", () => {
    for (const target of [
      "https://attacker.example/",
      "//attacker.example",
      "/\\attacker.example",
      "/\t/attacker.example",
      "/.//attacker.example",
      "/..//attacker.example",
    ]) {
      expect(safeRedirect(target)).toBe("/");
    }
  });

  it("does not return to the sign-in page", () => {
    expect(safeRedirect("/sign-in?redirect=/x")).toBe("/");
  });
});
