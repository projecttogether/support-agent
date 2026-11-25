import type { AgentRuntime, PipelineResult } from "./pipeline";
import { escapeMrkdwn, isSlackLink, markdownToMrkdwn } from "./slack-format";

/** What the bot posts in the thread for one message. */
export type Reply = {
  /** Slack mrkdwn, exactly as posted. */
  text: string;
  /**
   * Whether Slack may turn bare URLs and names in the text into links. Never
   * for a model's answer, whose only links are the allowed ones it carries;
   * kept for the texts an admin configured (escalation, headline and error message).
   */
  autoLinkUrls: boolean;
};

/**
 * The reply to a pipeline result, or null to post nothing. The only place
 * that renders what the bot posts: the model's answer with links to allowed
 * URLs only and a line of links to the cited passages, the escalation or
 * headline message (escaped), or the error message (as written). `errorMessage` null
 * posts nothing for an error (saved tests).
 */
export function replyFor(
  result: Pick<PipelineResult, "outcome" | "answer" | "sources" | "citedRefs">,
  agent: Pick<AgentRuntime, "instructions" | "noAnswerMode" | "escalationMessage" | "headlineMessage">,
  errorMessage: string | null,
): Reply | null {
  switch (result.outcome) {
    case "answered": {
      const cited = result.sources.filter((source) => result.citedRefs.includes(source.ref));
      const answer = markdownToMrkdwn(result.answer ?? "", linkableUrls(result.sources, agent.instructions));
      return { text: [answer, sourcesLine(cited)].filter(Boolean).join("\n\n"), autoLinkUrls: false };
    }
    case "no_answer": {
      const message = agent.noAnswerMode === "escalate" ? agent.escalationMessage.trim() : "";
      return message ? { text: escapeMrkdwn(message), autoLinkUrls: true } : null;
    }
    case "error":
      return errorMessage === null ? null : { text: errorMessage, autoLinkUrls: true };
    case "headline": {
      const message = agent.headlineMessage.trim();
      return message ? { text: escapeMrkdwn(message), autoLinkUrls: true } : null;
    }
    case "silent":
      return null;
  }
}

/** URLs in a text, without trailing punctuation or markup (`**url**`, `<url|label>`). */
function urlsIn(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s<>"'`()[\]|]+/gi)].map((match) =>
    match[0].replace(/[.,;:!?*_~]+$/, ""),
  );
}

/** The URLs an answer may link to: the passages' own, and those in their texts and in the instructions. */
function linkableUrls(sources: { url: string | null; text: string }[], instructions: string): string[] {
  const urls = sources.flatMap((source) => [...(source.url ? [source.url] : []), ...urlsIn(source.text)]);
  return [...urls, ...urlsIn(instructions)];
}

/** One line with links to the cited sources, e.g. ":page_facing_up: <url|Title> · <url|Title>". */
function sourcesLine(sources: { title: string; url: string | null }[]): string | null {
  const seen = new Set<string>();
  const links: string[] = [];
  for (const source of sources) {
    if (!source.url || !isSlackLink(source.url) || seen.has(source.url)) continue;
    seen.add(source.url);
    const label = escapeMrkdwn(source.title.replace(/[|\n]/g, " ").trim() || source.url);
    links.push(`<${escapeMrkdwn(source.url)}|${label}>`);
  }
  return links.length > 0 ? `:page_facing_up: ${links.join(" · ")}` : null;
}
