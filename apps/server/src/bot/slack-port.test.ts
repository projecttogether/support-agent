import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebClient } from "@slack/web-api";
import { isSlackFileUrl, webSlackPort } from "./slack-port";

describe("isSlackFileUrl", () => {
  it("accepts Slack's own https hosts only", () => {
    expect(isSlackFileUrl("https://files.slack.com/files-pri/T1-F1/download/a.png")).toBe(true);
    expect(isSlackFileUrl("https://example.slack.com/files/U1/F1/a.png")).toBe(true);
    expect(isSlackFileUrl("http://files.slack.com/files-pri/T1-F1/a.png")).toBe(false);
    expect(isSlackFileUrl("https://files.slack.com.attacker.example/a.png")).toBe(false);
    expect(isSlackFileUrl("https://files.slack.com@attacker.example/a.png")).toBe(false);
    expect(isSlackFileUrl("https://notslack.com/a.png")).toBe(false);
    expect(isSlackFileUrl("not a url")).toBe(false);
  });
});

it("posts explicit citations without Slack auto-linking answer text", async () => {
  const postMessage = vi.fn().mockResolvedValue({ ts: "1.000001" });
  const port = webSlackPort({ chat: { postMessage } } as unknown as WebClient, "xoxb-test-token");
  const text = "See <https://docs.example.org|the guide>, or the text https://other.example.org.";
  await port.postMessage({ channel: "C1", text, threadTs: null, username: null, iconUrl: null });
  expect(postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ text, parse: "none", unfurl_links: false, unfurl_media: false }),
  );
});

it("preserves auto-linking for configured messages", async () => {
  const postMessage = vi.fn().mockResolvedValue({ ts: "1.000001" });
  const port = webSlackPort({ chat: { postMessage } } as unknown as WebClient, "xoxb-test-token");
  const text = "Contact https://help.example.org.";
  await port.postMessage({
    channel: "C1",
    text,
    threadTs: null,
    username: null,
    iconUrl: null,
    autoLinkUrls: true,
  });
  expect(postMessage.mock.calls[0]?.[0]).not.toHaveProperty("parse");
});

it.each([false, true])("sanitizes posting failures, with customization retry %s", async (customize) => {
  const postMessage = vi.fn().mockRejectedValue(new Error("Private upstream detail"));
  if (customize) postMessage.mockRejectedValueOnce({ data: { error: "missing_scope" } });
  const port = webSlackPort({ chat: { postMessage } } as unknown as WebClient, "xoxb-test-token");
  await expect(
    port.postMessage({
      channel: "C1",
      threadTs: null,
      text: "Test",
      username: customize ? "Support" : null,
      iconUrl: null,
    }),
  ).rejects.toMatchObject({ message: "Could not post the Slack message", code: "request_failed" });
  expect(postMessage).toHaveBeenCalledTimes(customize ? 2 : 1);
  if (customize) expect(postMessage.mock.calls[1]?.[0]).not.toHaveProperty("username");
});

describe("downloadImage", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const port = webSlackPort({} as WebClient, "xoxb-test-token");
  const image = { mimetype: "image/png", size: 4 };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends the bot token to Slack's file host", async () => {
    fetchMock.mockResolvedValueOnce(new Response("abcd", { headers: { "content-type": "image/png" } }));
    const result = await port.downloadImage({
      ...image,
      url_private_download: "https://files.slack.com/files-pri/T1-F1/download/a.png",
    });
    expect(result).toEqual({ mediaType: "image/png", data: Buffer.from("abcd").toString("base64") });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://files.slack.com/files-pri/T1-F1/download/a.png");
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer xoxb-test-token");
  });

  it("does not fetch files hosted outside Slack", async () => {
    expect(await port.downloadImage({ ...image, url_private: "https://attacker.example/a.png" })).toBeNull();
    expect(
      await port.downloadImage({
        ...image,
        is_external: true,
        url_private: "https://files.slack.com/files-pri/T1-F1/a.png",
      }),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops reading an image larger than 5 MB", async () => {
    const endless = new ReadableStream<Uint8Array>({
      pull: (controller) => controller.enqueue(new Uint8Array(1024 * 1024)),
    });
    fetchMock.mockResolvedValueOnce(new Response(endless, { headers: { "content-type": "image/png" } }));
    const result = await port.downloadImage({
      ...image,
      url_private: "https://files.slack.com/files-pri/T1-F1/a.png",
    });
    expect(result).toBeNull();
  });
});

describe("findMessage", () => {
  it("finds a message of a thread and who wrote after it", async () => {
    const replies = vi.fn().mockResolvedValue({
      messages: [
        { ts: "1.000001", user: "UROOT", text: "Root", thread_ts: "1.000001" },
        { ts: "1.000002", user: "UPERSON", text: "It fails", thread_ts: "1.000001", files: [] },
        { ts: "1.000003", user: "UBOT", bot_id: "B1", text: "Try this", thread_ts: "1.000001" },
      ],
    });
    const port = webSlackPort({ conversations: { replies } } as unknown as WebClient, "xoxb-test-token");
    expect(await port.findMessage("C1", "1.000001", "1.000002")).toEqual({
      message: {
        subtype: undefined,
        user: "UPERSON",
        bot_id: undefined,
        text: "It fails",
        ts: "1.000002",
        thread_ts: "1.000001",
        files: [],
      },
      later: [{ ts: "1.000003", userId: "UBOT", fromBot: true }],
    });
    expect(replies).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "C1", ts: "1.000001", oldest: "1.000002", inclusive: true }),
    );
  });

  it("returns null for a message that is gone", async () => {
    const missing = vi.fn().mockResolvedValue({ messages: [{ ts: "1.000001", user: "UROOT" }] });
    const gone = vi.fn().mockRejectedValue({ data: { error: "thread_not_found" } });
    for (const replies of [missing, gone]) {
      const port = webSlackPort({ conversations: { replies } } as unknown as WebClient, "xoxb-test-token");
      expect(await port.findMessage("C1", "1.000001", "1.000002")).toBeNull();
    }
  });

  it("reports other failures without Slack's response text", async () => {
    const replies = vi.fn().mockRejectedValue(new Error("Private upstream detail"));
    const port = webSlackPort({ conversations: { replies } } as unknown as WebClient, "xoxb-test-token");
    await expect(port.findMessage("C1", "1.000001", "1.000002")).rejects.toMatchObject({
      message: "Could not read the Slack message",
      code: "request_failed",
    });
  });
});
