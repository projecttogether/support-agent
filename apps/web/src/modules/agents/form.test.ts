import { describe, expect, it } from "vitest";
import {
  DEFAULT_ESCALATION_MESSAGE,
  DEFAULT_HEADLINE_MESSAGE,
  DEFAULT_INSTRUCTIONS,
} from "@support-agent/shared/api/agents";
import { draftFromValues, toFormValues } from "./form";
import { testFromResult } from "./test-console";

const PROVIDER = "0f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f";

describe("agent form", () => {
  it("starts a new agent off, with the default instructions, escalation and headline message", () => {
    const values = toFormValues(null);
    expect(values.enabled).toBe(false);
    expect(values.instructions).toBe(DEFAULT_INSTRUCTIONS);
    expect(values.escalationMessage).toBe(DEFAULT_ESCALATION_MESSAGE);
    expect(values.headlineThreads).toBe(true);
    expect(values.headlineMessage).toBe(DEFAULT_HEADLINE_MESSAGE);
  });

  it("turns the form into a draft with blanks as null", () => {
    const result = draftFromValues({
      ...toFormValues(null),
      name: "IT support",
      providerId: PROVIDER,
      model: "claude-sonnet-5-5",
      channels: ["C01ABCDEF"],
      displayName: "  ",
    });
    expect(result).toMatchObject({
      ok: true,
      draft: {
        name: "IT support",
        fallbackModel: null,
        displayName: null,
        iconUrl: null,
        channels: ["C01ABCDEF"],
      },
    });
  });

  it("reports the first problem of an invalid draft", () => {
    const result = draftFromValues({ ...toFormValues(null), name: "IT support", enabled: true });
    expect(result).toEqual({ ok: false, message: "Choose a provider" });
  });
});

describe("testFromResult", () => {
  const base = {
    reason: null,
    searchQueries: [],
    slackText: null,
    provider: null,
    model: null,
    usedFallback: false,
    error: null,
    timings: { triageMs: null, searchMs: null, answerMs: null, totalMs: 1 },
    usage: { inputTokens: 0, outputTokens: 0 },
  };

  it("expects an answer citing the first cited source with a URL", () => {
    const test = testFromResult("How do I reset my password?", {
      ...base,
      outcome: "answered",
      sources: [
        {
          ref: "S1",
          knowledgeSourceName: "Wiki",
          title: "VPN",
          url: "https://wiki.example.org/vpn",
          section: null,
          text: "",
        },
        {
          ref: "S2",
          knowledgeSourceName: "Wiki",
          title: "Passwords",
          url: "https://wiki.example.org/pw",
          section: null,
          text: "",
        },
      ],
      citedRefs: ["S2"],
    });
    expect(test).toEqual({
      question: "How do I reset my password?",
      expectation: "answer",
      expectedUrl: "https://wiki.example.org/pw",
    });
  });

  it("expects silence, or a headline, when the agent showed it", () => {
    for (const outcome of ["silent", "headline"] as const) {
      expect(testFromResult("Thanks!", { ...base, outcome, sources: [], citedRefs: [] })).toEqual({
        question: "Thanks!",
        expectation: outcome,
        expectedUrl: null,
      });
    }
  });
});
