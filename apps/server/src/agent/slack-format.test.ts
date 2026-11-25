import { describe, expect, it } from "vitest";
import { alertText, cleanSlackText, markdownToMrkdwn } from "./slack-format";

describe("markdownToMrkdwn", () => {
  it("converts emphasis, links, headings and lists", () => {
    const markdown = [
      "## Reset your password",
      "Open **Settings** and choose *Security*.",
      "- Go to [the portal](https://it.example.org/reset)",
      "1. Done",
    ].join("\n");
    expect(markdownToMrkdwn(markdown, ["https://it.example.org/reset"])).toBe(
      [
        "*Reset your password*",
        "Open *Settings* and choose _Security_.",
        "• Go to <https://it.example.org/reset|the portal>",
        "1. Done",
      ].join("\n"),
    );
  });

  it("escapes Slack control characters and keeps code unchanged", () => {
    expect(markdownToMrkdwn("Use a < b & c > d and `**raw**`", [])).toBe(
      "Use a &lt; b &amp; c &gt; d and `**raw**`",
    );
    expect(markdownToMrkdwn("```\n**x**\n```", [])).toBe("```\n**x**\n```");
  });

  it("does not turn non-http links into Slack links", () => {
    expect(markdownToMrkdwn("[x](javascript:alert(1))", [])).toBe("[x](javascript:alert(1))");
  });

  it("keeps only links to linkable URLs; other links become their label", () => {
    expect(
      markdownToMrkdwn(
        "Open [the form](https://it.example.org/form/?a=1&b=2) or [this](https://x.example/)",
        ["https://it.example.org/form?a=1&b=2"],
      ),
    ).toBe("Open <https://it.example.org/form?a=1&amp;b=2|the form> or this");
  });

  it("compares URLs without their HTML escaping", () => {
    expect(
      markdownToMrkdwn("[portal](https://example.org/?a=1&amp;b=2)", ["https://example.org/?a=1&b=2"]),
    ).toBe("<https://example.org/?a=1&amp;b=2|portal>");
    expect(
      markdownToMrkdwn("[portal](https://example.org/?a=1&b=2)", ["https://example.org/?a=1&amp;b=2"]),
    ).toBe("<https://example.org/?a=1&amp;amp;b=2|portal>");
  });
  it("prefers exact URLs and never guesses between different trusted targets", () => {
    const url = "https://example.org/guide?next=/home";
    const other = "https://example.org/guide/?next=/home";
    const withSlashInQuery = "https://example.org/guide?next=/home/";
    expect(markdownToMrkdwn(`[guide](${url})`, [url, other, withSlashInQuery])).toBe(`<${url}|guide>`);
    expect(markdownToMrkdwn("[guide](https://example.org/guide//?next=/home)", [url, other])).toBe("guide");
    expect(markdownToMrkdwn(`[guide](${withSlashInQuery})`, [url])).toBe("guide");
  });

  it("keeps distinct approved query strings even when one resembles HTML escaping", () => {
    const literal = "https://example.org/guide?a=1&amp;b=2";
    const decoded = "https://example.org/guide?a=1&b=2";
    expect(markdownToMrkdwn(`[guide](${literal})`, [literal, decoded])).toBe(
      "<https://example.org/guide?a=1&amp;amp;b=2|guide>",
    );
    expect(markdownToMrkdwn(`[guide](${decoded})`, [literal, decoded])).toBe(
      "<https://example.org/guide?a=1&amp;b=2|guide>",
    );
    expect(markdownToMrkdwn("[guide](https://example.org/guide/?a=1&b=2)", [literal, decoded])).toBe("guide");
  });

  it("rejects a fallback shared by URLs escaped to different depths", () => {
    const decoded = "https://example.org/guide?a=1&b=2";
    const doubleEscaped = "https://example.org/guide?a=1&amp;amp;b=2";
    const candidate = "https://example.org/guide?a=1&amp;b=2";
    expect(markdownToMrkdwn(`[guide](${candidate})`, [decoded, doubleEscaped])).toBe("guide");
  });

  it("preserves the trusted target exactly when formatting an inline link", () => {
    const url = "https://it.example.org/a__b__c";
    expect(markdownToMrkdwn("[**guide**](" + url + ")", [url])).toBe("<" + url + "|*guide*>");
  });
});

describe("cleanSlackText", () => {
  it("removes the bot mention and Slack markup", () => {
    expect(
      cleanSlackText(
        "<@UBOT> how do I join <#C123|general>? See <https://x.example.org|this> &amp; <!here>",
        "UBOT",
      ),
    ).toBe("how do I join #general? See this (https://x.example.org) & @here");
  });
});

describe("alertText", () => {
  it("keeps the agent name and the error plain text", () => {
    expect(alertText("<!channel> IT", "C123", "Search failed: <@U1> & co")).toBe(
      ":warning: *&lt;!channel&gt; IT* could not answer in <#C123>: Search failed: &lt;@U1&gt; &amp; co",
    );
  });
});
