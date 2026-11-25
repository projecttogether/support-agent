/**
 * Slack "mrkdwn" from the Markdown the models write. Slack needs &, < and >
 * escaped in text, uses *bold* and _italic_, <url|label> links and no headings.
 */
export function escapeMrkdwn(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Undo one layer of Slack or HTML escaping. */
function unescapeHtml(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** Allow harmless formatting differences, while preferring the exact URL. */
function linkKey(url: string): string {
  // Collapse nested escaping only for fallback comparison. Exact URLs keep their bytes.
  const unescaped = url.replace(/&(?:amp;)*(amp|lt|gt);/g, (_match, entity: string) =>
    unescapeHtml(`&${entity};`),
  );
  const path = unescaped.split(/[?#]/, 1)[0]!;
  return path.replace(/\/+$/, "") + unescaped.slice(path.length);
}

/** Keep Slack markup delimiters and credentials out of link targets. */
export function isSlackLink(url: string): boolean {
  if (!/^https?:\/\//i.test(url) || /[<>|\s\p{Cc}]/u.test(url)) return false;
  const parsed = URL.parse(url);
  return Boolean(parsed && !parsed.username && !parsed.password);
}

function convertInline(text: string, findLink: (url: string) => string | null | undefined): string {
  const targets: string[] = [];
  let result = escapeMrkdwn(text.replaceAll("\uE000", ""));
  // Hold URLs aside so emphasis formatting cannot change an approved target.
  result = result.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/gi,
    (_match, label: string, url: string) => {
      const target = findLink(unescapeHtml(url));
      if (!target) return label;
      const index = targets.push(escapeMrkdwn(target)) - 1;
      return `<\uE000${index}\uE000|${label.replace(/\|/g, "/")}>`;
    },
  );
  const BOLD = "\u0001";
  result = result.replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${BOLD}`).replace(/__(.+?)__/g, `${BOLD}$1${BOLD}`);
  result = result.replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, "$1_$2_");
  result = result.replaceAll(BOLD, "*");
  result = result.replace(/~~(.+?)~~/g, "~$1~");
  return result.replace(/\uE000(\d+)\uE000/g, (_token, index: string) => targets[Number(index)]!);
}

/** Slack mrkdwn from the model's Markdown; links only to `linkable` URLs. */
export function markdownToMrkdwn(markdown: string, linkable: Iterable<string>): string {
  const allowed = new Set<string>();
  const fallbackTargets = new Map<string, string | null>();
  for (const target of linkable) {
    if (!isSlackLink(target) || allowed.has(target)) continue;
    allowed.add(target);
    const key = linkKey(target);
    fallbackTargets.set(key, fallbackTargets.has(key) ? null : target);
  }
  const findLink = (url: string) => (allowed.has(url) ? url : fallbackTargets.get(linkKey(url)));
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  let inCode = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCode = !inCode;
      output.push("```");
      continue;
    }
    if (inCode) {
      output.push(escapeMrkdwn(line));
      continue;
    }
    const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      output.push(`*${convertInline(heading[1]!.replace(/\*\*/g, ""), findLink)}*`);
      continue;
    }
    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      output.push(`${bullet[1]}• ${convertInline(bullet[2]!, findLink)}`);
      continue;
    }
    // Inline code keeps its content unchanged.
    const parts = line.split(/(`[^`]+`)/g);
    output.push(
      parts
        .map((part) =>
          part.startsWith("`") && part.endsWith("`") && part.length > 1
            ? escapeMrkdwn(part)
            : convertInline(part, findLink),
        )
        .join(""),
    );
  }
  return output
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The alert channel's message about an agent that could not answer; name and error stay plain text. */
export function alertText(agentName: string, channelId: string, error: string): string {
  return `:warning: *${escapeMrkdwn(agentName)}* could not answer in <#${channelId}>: ${escapeMrkdwn(error)}`;
}

/** Removes the bot's mention and Slack's markup of mentions and links from a question. */
export function cleanSlackText(text: string, botUserId: string | null): string {
  let result = text;
  if (botUserId) result = result.replaceAll(`<@${botUserId}>`, "");
  return result
    .replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, "$2 ($1)")
    .replace(/<(https?:\/\/[^>]+)>/g, "$1")
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1")
    .replace(/<!(here|channel|everyone)>/g, "@$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}
