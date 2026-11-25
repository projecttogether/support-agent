import { describe, expect, it } from "vitest";
import type { RetrievedSource } from "@support-agent/shared/api/agents";
import { replyFor } from "./reply";

const passage = (ref: string, title: string, url: string | null, text = "Passage."): RetrievedSource => ({
  ref,
  knowledgeSourceName: "IT KB",
  title,
  url,
  section: null,
  text,
});

const agent = {
  instructions: "Answer IT questions.",
  noAnswerMode: "escalate" as const,
  escalationMessage: "Please ask the IT team.",
  headlineMessage: "Please write the whole request in one message.",
};

const answered = (answer: string, sources: RetrievedSource[], citedRefs: string[]) => ({
  outcome: "answered" as const,
  answer,
  sources,
  citedRefs,
});

const nothing = { answer: null, sources: [], citedRefs: [] };

describe("replyFor", () => {
  it("posts the answer as mrkdwn with a line of links to the cited passages, without auto-linking", () => {
    const sources = [
      passage("S1", "Reset your password", "https://it.example.org/password"),
      passage("S2", "Wi-Fi", "https://it.example.org/wifi"),
    ];
    expect(
      replyFor(answered("Go to the **portal** and click Reset.", sources, ["S1"]), agent, "Error"),
    ).toEqual({
      text: "Go to the *portal* and click Reset.\n\n:page_facing_up: <https://it.example.org/password|Reset your password>",
      autoLinkUrls: false,
    });
  });

  it("links only URLs from the passages, their texts or the instructions", () => {
    const sources = [
      passage("S1", "Reset your password", "https://it.example.org/password"),
      passage(
        "S2",
        "Wi-Fi",
        "https://it.example.org/wifi",
        "See https://wiki.example.org/vpn. Or (https://it.example.org/b)",
      ),
    ];
    const answer =
      "Use [the portal](https://it.example.org/password/), [Wi-Fi](https://it.example.org/wifi), [VPN](https://wiki.example.org/vpn), [B](https://it.example.org/b), [the helpdesk](https://help.example.org/new) or [the wiki](https://wiki.example.org/start). Not [this](https://attacker.example/login).";
    const instructions =
      "Tickets: **https://help.example.org/new**, docs <https://wiki.example.org/start|the wiki>.";
    expect(replyFor(answered(answer, sources, ["S1"]), { ...agent, instructions }, null)?.text).toBe(
      "Use <https://it.example.org/password|the portal>, <https://it.example.org/wifi|Wi-Fi>, <https://wiki.example.org/vpn|VPN>, <https://it.example.org/b|B>, <https://help.example.org/new|the helpdesk> or <https://wiki.example.org/start|the wiki>. Not this.\n\n:page_facing_up: <https://it.example.org/password|Reset your password>",
    );
  });

  it("links each cited URL once and skips passages without a well-formed http URL", () => {
    const sources = [
      passage("S1", "Passwords | IT", "https://it.example.org/a"),
      passage("S2", "Again", "https://it.example.org/a"),
      passage("S3", "No link", null),
      passage("S4", "Wi-Fi <guest>", "https://it.example.org/b?x=1&y=2"),
      passage("S5", "Malformed", "https://example.org/a|label"),
      passage("S6", "Malformed", "https://example.org/a<text>"),
      passage("S7", "Not cited", "https://it.example.org/c"),
    ];
    const refs = ["S1", "S2", "S3", "S4", "S5", "S6"];
    expect(replyFor(answered("Done.", sources, refs), agent, null)?.text).toBe(
      "Done.\n\n:page_facing_up: <https://it.example.org/a|Passwords   IT> · <https://it.example.org/b?x=1&amp;y=2|Wi-Fi &lt;guest&gt;>",
    );
    expect(replyFor(answered("Done.", sources, ["S3"]), agent, null)?.text).toBe("Done.");
  });

  it("posts the escalation message escaped, with auto-linking, when nothing answers", () => {
    const escalation = { ...agent, escalationMessage: "  Please ask <#C1|it-team> & wait.  " };
    expect(replyFor({ outcome: "no_answer", ...nothing }, escalation, "Error")).toEqual({
      text: "Please ask &lt;#C1|it-team&gt; &amp; wait.",
      autoLinkUrls: true,
    });
    expect(
      replyFor({ outcome: "no_answer", ...nothing }, { ...escalation, noAnswerMode: "silent" }, "Error"),
    ).toBeNull();
    expect(
      replyFor({ outcome: "no_answer", ...nothing }, { ...agent, escalationMessage: "  " }, "Error"),
    ).toBeNull();
  });

  it("posts the error message as written, with auto-linking, and nothing without one", () => {
    const errorMessage = "Sorry, ask <#C1|it-team> & see https://status.example.org";
    expect(replyFor({ outcome: "error", ...nothing }, agent, errorMessage)).toEqual({
      text: errorMessage,
      autoLinkUrls: true,
    });
    expect(replyFor({ outcome: "error", ...nothing }, agent, null)).toBeNull();
  });

  it("posts the headline message escaped, with auto-linking, and nothing without one", () => {
    const headline = { ...agent, headlineMessage: "  One message, please <#C1|it-team> & thanks.  " };
    expect(replyFor({ outcome: "headline", ...nothing }, headline, "Error")).toEqual({
      text: "One message, please &lt;#C1|it-team&gt; &amp; thanks.",
      autoLinkUrls: true,
    });
    expect(
      replyFor({ outcome: "headline", ...nothing }, { ...agent, headlineMessage: " " }, "Error"),
    ).toBeNull();
  });

  it("posts nothing when the agent stays silent", () => {
    expect(replyFor({ outcome: "silent", ...nothing }, agent, "Error")).toBeNull();
  });
});
