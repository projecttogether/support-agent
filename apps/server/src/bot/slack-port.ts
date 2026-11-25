import type { WebClient } from "@slack/web-api";
import type { ImageInput } from "../llm";
import { cleanSlackText } from "../agent/slack-format";
import type { ThreadMessage } from "../agent/pipeline";
import { readLimited } from "../core/read-limited";
import { slackErrorCode } from "../slack/web";
import type { MessageEvent } from "./handler";

/** What the bot does in Slack. An interface, so the message handling can be tested without Slack. */
export interface SlackPort {
  postMessage(message: {
    channel: string;
    /** Null posts a new message instead of a thread reply. */
    threadTs: string | null;
    text: string;
    /** Keep Slack auto-linking for configured messages. */
    autoLinkUrls?: boolean;
    username: string | null;
    iconUrl: string | null;
  }): Promise<string | null>;
  addReaction(channel: string, ts: string, name: string): Promise<void>;
  removeReaction(channel: string, ts: string, name: string): Promise<void>;
  /** Earlier messages of a thread, oldest first, without the message `beforeTs` and later ones. */
  threadHistory(
    channel: string,
    threadTs: string,
    beforeTs: string,
    botUserId: string | null,
  ): Promise<ThreadMessage[]>;
  /** Who wrote each message of a thread, oldest first (no texts). */
  threadAuthors(channel: string, threadTs: string): Promise<ThreadAuthor[]>;
  /**
   * The message `ts` of a thread (a top-level message is its own thread) and
   * who wrote the messages after it; null when the message is gone.
   */
  findMessage(channel: string, threadTs: string, ts: string): Promise<FoundMessage | null>;
  downloadImage(file: SlackFile): Promise<ImageInput | null>;
}

export type ThreadAuthor = { ts: string; userId: string | null; fromBot: boolean };

export type FoundMessage = { message: Omit<MessageEvent, "type" | "channel">; later: ThreadAuthor[] };

export type SlackFile = {
  mimetype?: string;
  size?: number;
  /** Hosted outside Slack (e.g. Google Drive): its URLs lead elsewhere. */
  is_external?: boolean;
  url_private?: string;
  url_private_download?: string;
};

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function isReadableImage(file: SlackFile): boolean {
  return Boolean(file.mimetype && IMAGE_TYPES.has(file.mimetype) && (file.size ?? 0) <= MAX_IMAGE_BYTES);
}

/**
 * Whether a file URL is Slack's own. Only those get the bot token: the URL
 * comes from the message, and a file hosted elsewhere would send the token
 * to that host.
 */
export function isSlackFileUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "slack.com" || url.hostname.endsWith(".slack.com"));
  } catch {
    return false;
  }
}

export function webSlackPort(client: WebClient, botToken: string): SlackPort {
  return {
    async postMessage({ channel, threadTs, text, username, iconUrl, autoLinkUrls }) {
      const base = {
        channel,
        text,
        // Keep explicit citations and mrkdwn, but do not auto-link model text.
        ...(autoLinkUrls ? {} : { parse: "none" as const }),
        unfurl_links: false,
        unfurl_media: false,
        ...(threadTs ? { thread_ts: threadTs } : {}),
      };
      try {
        const response = await client.chat
          .postMessage({
            ...base,
            ...(username ? { username } : {}),
            ...(iconUrl ? { icon_url: iconUrl } : {}),
          })
          .catch((error: unknown) => {
            // Without chat:write.customize, post under the app's own name.
            if ((username || iconUrl) && slackErrorCode(error) === "missing_scope") {
              return client.chat.postMessage(base);
            }
            throw error;
          });
        return response.ts ?? null;
      } catch (error) {
        // Plain SDK errors can include arbitrary response header values.
        throw Object.assign(new Error("Could not post the Slack message"), { code: slackErrorCode(error) });
      }
    },
    async addReaction(channel, ts, name) {
      await client.reactions.add({ channel, timestamp: ts, name }).catch(() => undefined);
    },
    async removeReaction(channel, ts, name) {
      await client.reactions.remove({ channel, timestamp: ts, name }).catch(() => undefined);
    },
    async threadHistory(channel, threadTs, beforeTs, botUserId) {
      const response = await client.conversations.replies({ channel, ts: threadTs, limit: 50 });
      return (response.messages ?? [])
        .filter((message) => message.ts && Number(message.ts) < Number(beforeTs))
        .slice(-15)
        .map((message) => ({
          role:
            message.bot_id || (botUserId && message.user === botUserId)
              ? ("agent" as const)
              : ("person" as const),
          text: cleanSlackText(message.text ?? "", botUserId).slice(0, 2000),
        }))
        .filter((message) => message.text !== "");
    },
    async threadAuthors(channel, threadTs) {
      const response = await client.conversations.replies({ channel, ts: threadTs, limit: 100 });
      return (response.messages ?? [])
        .filter((message) => message.ts)
        .map((message) => ({
          ts: message.ts!,
          userId: message.user ?? null,
          fromBot: Boolean(message.bot_id),
        }));
    },
    async findMessage(channel, threadTs, ts) {
      let messages;
      try {
        const response = await client.conversations.replies({
          channel,
          ts: threadTs,
          oldest: ts,
          inclusive: true,
          limit: 100,
        });
        messages = response.messages ?? [];
      } catch (error) {
        // The thread's first message was deleted.
        if (slackErrorCode(error) === "thread_not_found") return null;
        throw Object.assign(new Error("Could not read the Slack message"), { code: slackErrorCode(error) });
      }
      const message = messages.find((candidate) => candidate.ts === ts);
      if (!message) return null;
      return {
        message: {
          // Not in the SDK's type of replies, but in Slack's answer (file_share, thread_broadcast).
          subtype: (message as { subtype?: string }).subtype,
          user: message.user,
          bot_id: message.bot_id,
          text: message.text,
          ts,
          thread_ts: message.thread_ts,
          files: message.files as SlackFile[] | undefined,
        },
        later: messages
          .filter((candidate) => candidate.ts && Number(candidate.ts) > Number(ts))
          .map((candidate) => ({
            ts: candidate.ts!,
            userId: candidate.user ?? null,
            fromBot: Boolean(candidate.bot_id),
          })),
      };
    },
    async downloadImage(file) {
      const url = file.url_private_download ?? file.url_private;
      if (!url || file.is_external || !isSlackFileUrl(url) || !isReadableImage(file)) return null;
      try {
        const response = await fetch(url, {
          headers: { authorization: `Bearer ${botToken}` },
          signal: AbortSignal.timeout(20_000),
        });
        const type = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
        // Without files:read Slack answers with its sign-in page instead of the file.
        if (!response.ok || !IMAGE_TYPES.has(type)) return null;
        const bytes = await readLimited(response, MAX_IMAGE_BYTES);
        if (!bytes) return null;
        return { mediaType: type as ImageInput["mediaType"], data: bytes.toString("base64") };
      } catch {
        return null;
      }
    },
  };
}
