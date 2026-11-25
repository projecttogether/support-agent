/**
 * The body of a response from an outside service, or null when it is longer
 * than `maxBytes`. Reading stops as soon as the limit is passed, so a huge or
 * endless body cannot fill the memory.
 */
export async function readLimited(response: Response, maxBytes: number): Promise<Buffer | null> {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!response.body) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  // Leaving the loop early cancels the stream.
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > maxBytes) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
