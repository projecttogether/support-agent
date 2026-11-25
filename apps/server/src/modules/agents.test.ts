import { describe, expect, it } from "vitest";
import type { PipelineResult } from "../agent/pipeline";
import { judge } from "./agents";

const run = (outcome: PipelineResult["outcome"], slackText: string | null) => ({
  outcome,
  reason: "Only a topic",
  error: null,
  sources: [],
  citedRefs: [],
  slackText,
});

describe("judge", () => {
  it("passes a headline test only for a headline, and a silent test only without a post", () => {
    const headline = { expectation: "headline", expectedUrl: null };
    const silent = { expectation: "silent", expectedUrl: null };
    expect(judge(headline, run("headline", "One message, please."))).toEqual({ passed: true, failure: null });
    expect(judge(headline, run("silent", null))).toEqual({
      passed: false,
      failure: "The agent didn't take the message for a headline: Only a topic",
    });
    expect(judge(silent, run("headline", null))).toEqual({ passed: true, failure: null });
    expect(judge(silent, run("headline", "One message, please."))).toEqual({
      passed: false,
      failure: "The agent posted its headline message",
    });
  });
});
