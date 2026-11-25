/**
 * A small reader for Slack's mrkdwn, enough to show answers as Slack shows
 * them: *bold*, _italic_, ~strike~, `code`, ```code blocks```, > quotes,
 * <url|label> links, <@U…>/<#C…|name> mentions, lists, line breaks and the
 * emoji the bot writes.
 * The result is a tree of plain data; `SlackMessage` renders it.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold" | "italic" | "strike"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; url: string; label: string }
  | { type: "mention"; text: string };

export type Block =
  | { type: "paragraph"; lines: Inline[][] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "quote"; lines: Inline[][] }
  | { type: "code"; text: string };

/** Slack escapes &, < and > in message text. */
export function decodeEntities(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

/** `<…>` tokens: links, user and channel mentions, and special mentions. */
function angle(content: string): Inline {
  const bar = content.indexOf("|");
  const target = bar === -1 ? content : content.slice(0, bar);
  const label = bar === -1 ? null : content.slice(bar + 1);
  if (target.startsWith("@")) return { type: "mention", text: `@${label ?? target.slice(1)}` };
  if (target.startsWith("#")) return { type: "mention", text: `#${label ?? target.slice(1)}` };
  if (target.startsWith("!")) {
    const name = target.slice(1).split("^")[0]!;
    return { type: "mention", text: label ?? `@${name}` };
  }
  const url = decodeEntities(target);
  if (SAFE_URL.test(url)) return { type: "link", url, label: decodeEntities(label ?? url) };
  return { type: "text", text: decodeEntities(label ?? content) };
}

// Code spans and <…> first (nothing is formatted inside them), then the
// emphasis markers. A marker opens after a non-word character and before a
// non-space, and closes after a non-space and before a non-word character.
const INLINE =
  /`([^`\n]+)`|<([^<>\n]+)>|(?<![\p{L}\p{N}*])\*(?!\s)([^*\n]*?[^\s*])\*(?![\p{L}\p{N}*])|(?<![\p{L}\p{N}_])_(?!\s)([^_\n]*?[^\s_])_(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}~])~(?!\s)([^~\n]*?[^\s~])~(?![\p{L}\p{N}~])/gu;

/** Inline formatting of one line. */
export function parseInline(line: string): Inline[] {
  const result: Inline[] = [];
  let last = 0;
  const pushText = (text: string) => {
    if (!text) return;
    // The emoji the bot writes before the cited sources; other codes stay as written.
    const value = decodeEntities(text).replaceAll(":page_facing_up:", "📄");
    const previous = result.at(-1);
    if (previous?.type === "text") previous.text += value;
    else result.push({ type: "text", text: value });
  };
  for (const match of line.matchAll(INLINE)) {
    pushText(line.slice(last, match.index));
    last = match.index + match[0].length;
    const [, code, link, bold, italic, strike] = match;
    if (code !== undefined) result.push({ type: "code", text: decodeEntities(code) });
    else if (link !== undefined) {
      const node = angle(link);
      if (node.type === "text") pushText(node.text);
      else result.push(node);
    } else if (bold !== undefined) result.push({ type: "bold", children: parseInline(bold) });
    else if (italic !== undefined) result.push({ type: "italic", children: parseInline(italic) });
    else if (strike !== undefined) result.push({ type: "strike", children: parseInline(strike) });
  }
  pushText(line.slice(last));
  return result;
}

const BULLET = /^\s*(?:[•◦▪‣·]|[-*](?=\s))\s*(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
const QUOTE = /^(?:&gt;|>)\s?(.*)$/;

function textBlocks(text: string, blocks: Block[]) {
  let paragraph: Inline[][] | null = null;
  const end = () => {
    paragraph = null;
  };
  for (const line of text.split("\n")) {
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const quote = bullet || numbered ? null : QUOTE.exec(line);
    const previous = blocks.at(-1);
    if (bullet || numbered) {
      end();
      const ordered = Boolean(numbered);
      const item = parseInline((bullet ?? numbered)![1]!);
      if (previous?.type === "list" && previous.ordered === ordered) previous.items.push(item);
      else blocks.push({ type: "list", ordered, items: [item] });
    } else if (quote) {
      end();
      const content = parseInline(quote[1]!);
      if (previous?.type === "quote") previous.lines.push(content);
      else blocks.push({ type: "quote", lines: [content] });
    } else if (line.trim() === "") {
      end();
    } else {
      if (!paragraph) {
        paragraph = [];
        blocks.push({ type: "paragraph", lines: paragraph });
      }
      paragraph.push(parseInline(line));
    }
  }
}

/** Splits a message into blocks: paragraphs (with line breaks), lists, quotes and code blocks. */
export function parseMrkdwn(text: string): Block[] {
  const blocks: Block[] = [];
  const parts = text.replace(/\r\n?/g, "\n").split("```");
  // An unclosed fence is plain text.
  const closed = parts.length % 2 === 1;
  parts.forEach((part, index) => {
    const isCode = index % 2 === 1 && (closed || index < parts.length - 1);
    if (isCode) {
      blocks.push({ type: "code", text: decodeEntities(part.replace(/^\n/, "").replace(/\n$/, "")) });
    } else {
      textBlocks(index % 2 === 1 ? `\`\`\`${part}` : part, blocks);
    }
  });
  return blocks;
}

/** The plain text of a message, e.g. for a short preview in a table. */
export function mrkdwnToText(text: string): string {
  const inline = (nodes: Inline[]): string =>
    nodes
      .map((node) => {
        switch (node.type) {
          case "text":
          case "code":
          case "mention":
            return node.text;
          case "link":
            return node.label;
          default:
            return inline(node.children);
        }
      })
      .join("");
  return parseMrkdwn(text)
    .map((block) => {
      switch (block.type) {
        case "code":
          return block.text;
        case "list":
          return block.items.map(inline).join(" · ");
        default:
          return block.lines.map(inline).join(" ");
      }
    })
    .join(" ");
}
