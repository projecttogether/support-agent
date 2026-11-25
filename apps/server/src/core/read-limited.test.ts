import { describe, expect, it } from "vitest";
import { readLimited } from "./read-limited";

/** A body that never ends, in 64 KiB chunks; counts what was read. */
function endlessBody() {
  const counter = { chunks: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      counter.chunks += 1;
      controller.enqueue(new Uint8Array(64 * 1024));
    },
    cancel() {
      counter.cancelled = true;
    },
  });
  return { response: new Response(stream), counter };
}

describe("readLimited", () => {
  it("returns bodies up to the limit", async () => {
    expect((await readLimited(new Response("abcd"), 4))?.toString()).toBe("abcd");
    expect((await readLimited(new Response(null), 4))?.length).toBe(0);
  });

  it("stops reading a longer body and cancels it", async () => {
    const { response, counter } = endlessBody();
    expect(await readLimited(response, 1024 * 1024)).toBeNull();
    expect(counter.chunks).toBeLessThan(20);
    expect(counter.cancelled).toBe(true);
  });

  it("refuses a declared length over the limit without reading", async () => {
    const { response, counter } = endlessBody();
    const declared = new Response(response.body, { headers: { "content-length": String(10 * 1024 * 1024) } });
    expect(await readLimited(declared, 1024 * 1024)).toBeNull();
    expect(counter.cancelled).toBe(true);
  });
});
