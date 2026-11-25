import { describe, expect, it } from "vitest";
import { mrkdwnToText, parseInline, parseMrkdwn } from "./mrkdwn";

describe("parseInline", () => {
  it("reads bold, italic, strike and code", () => {
    expect(parseInline("*Reset* your _password_ with ~old~ `passwd`")).toEqual([
      { type: "bold", children: [{ type: "text", text: "Reset" }] },
      { type: "text", text: " your " },
      { type: "italic", children: [{ type: "text", text: "password" }] },
      { type: "text", text: " with " },
      { type: "strike", children: [{ type: "text", text: "old" }] },
      { type: "text", text: " " },
      { type: "code", text: "passwd" },
    ]);
  });

  it("nests formatting", () => {
    expect(parseInline("*bold _and italic_*")).toEqual([
      {
        type: "bold",
        children: [
          { type: "text", text: "bold " },
          { type: "italic", children: [{ type: "text", text: "and italic" }] },
        ],
      },
    ]);
  });

  it("ignores markers inside words and around spaces", () => {
    expect(parseInline("snake_case_name and 2*3*4 and * not bold *")).toEqual([
      { type: "text", text: "snake_case_name and 2*3*4 and * not bold *" },
    ]);
  });

  it("reads links with and without a label", () => {
    expect(parseInline("See <https://wiki.example.org/vpn|the VPN guide> or <https://example.org>.")).toEqual(
      [
        { type: "text", text: "See " },
        { type: "link", url: "https://wiki.example.org/vpn", label: "the VPN guide" },
        { type: "text", text: " or " },
        { type: "link", url: "https://example.org", label: "https://example.org" },
        { type: "text", text: "." },
      ],
    );
  });

  it("keeps unsafe link targets as text", () => {
    expect(parseInline("<javascript:alert(1)|click>")).toEqual([{ type: "text", text: "click" }]);
  });

  it("reads mentions and decodes entities", () => {
    expect(parseInline("Ask <@U123> in <#C456|it-help> &amp; <!here> &lt;3")).toEqual([
      { type: "text", text: "Ask " },
      { type: "mention", text: "@U123" },
      { type: "text", text: " in " },
      { type: "mention", text: "#it-help" },
      { type: "text", text: " & " },
      { type: "mention", text: "@here" },
      { type: "text", text: " <3" },
    ]);
  });

  it("does not format inside code", () => {
    expect(parseInline("`*not bold*`")).toEqual([{ type: "code", text: "*not bold*" }]);
  });

  it("shows the emoji the bot writes before the cited sources", () => {
    expect(parseInline(":page_facing_up: <https://it.example.org/p|Printers>")).toEqual([
      { type: "text", text: "📄 " },
      { type: "link", url: "https://it.example.org/p", label: "Printers" },
    ]);
    expect(parseInline("`:page_facing_up:` and :custom_logo:")).toEqual([
      { type: "code", text: ":page_facing_up:" },
      { type: "text", text: " and :custom_logo:" },
    ]);
  });
});

describe("parseMrkdwn", () => {
  it("keeps line breaks within a paragraph and splits paragraphs at blank lines", () => {
    expect(parseMrkdwn("First line\nsecond line\n\nNext")).toEqual([
      {
        type: "paragraph",
        lines: [[{ type: "text", text: "First line" }], [{ type: "text", text: "second line" }]],
      },
      { type: "paragraph", lines: [[{ type: "text", text: "Next" }]] },
    ]);
  });

  it("reads bullet and numbered lists", () => {
    const blocks = parseMrkdwn("Steps:\n1. Open *Settings*\n2. Click Reset\n• one\n- two\n* three");
    expect(blocks.map((block) => block.type)).toEqual(["paragraph", "list", "list"]);
    expect(blocks[1]).toEqual({
      type: "list",
      ordered: true,
      items: [
        [
          { type: "text", text: "Open " },
          { type: "bold", children: [{ type: "text", text: "Settings" }] },
        ],
        [{ type: "text", text: "Click Reset" }],
      ],
    });
    expect(blocks[2]).toMatchObject({ type: "list", ordered: false });
    expect((blocks[2] as { items: unknown[] }).items).toHaveLength(3);
  });

  it("does not read a bold line as a bullet", () => {
    expect(parseMrkdwn("*Note:* restart first")[0]).toMatchObject({ type: "paragraph" });
  });

  it("reads quotes and code blocks", () => {
    expect(parseMrkdwn("&gt; quoted\n```\nnpm ci\n```")).toEqual([
      { type: "quote", lines: [[{ type: "text", text: "quoted" }]] },
      { type: "code", text: "npm ci" },
    ]);
  });

  it("gives the plain text", () => {
    expect(mrkdwnToText("*Hi* <https://example.org|there>\n• a\n• b")).toBe("Hi there a · b");
  });
});
