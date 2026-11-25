import { describe, expect, it } from "vitest";
import { defineMessages, translate } from "./index";

const messages = defineMessages({
  en: { members: "{count} members", members_one: "1 member", rows: "{count} rows" },
  de: { members: "{count} Mitglieder", members_one: "1 Mitglied", rows: "{count} Zeilen" },
});

describe("translate", () => {
  it("uses the singular form for a count of 1", () => {
    const t = translate(messages, "en");
    expect(t("members", { count: 1 })).toBe("1 member");
    expect(t("members", { count: "1" })).toBe("1 member");
    expect(t("members", { count: 2 })).toBe("2 members");
    expect(t("members", { count: 0 })).toBe("0 members");
    expect(t("members", { count: "1,000" })).toBe("1,000 members");
    expect(translate(messages, "de")("members", { count: 1 })).toBe("1 Mitglied");
  });

  it("falls back to the plural text without a singular form", () => {
    expect(translate(messages, "en")("rows", { count: 1 })).toBe("1 rows");
  });
});
