import type { ReadStream } from "node:tty";
import { AppError } from "../http/errors";

/** What a command reads and writes; tests pass their own. */
export type CliIo = {
  /** Everything on stdin, as text. */
  readStdin(): Promise<string>;
  /** The command's output: JSON or lines, never a secret. */
  out(text: string): void;
  /** Messages for the person at the terminal. */
  err(text: string): void;
};

/** A wrong command or option, or a body that is not JSON: exit code 2. */
export class UsageError extends Error {
  override name = "UsageError";
  constructor(
    message: string,
    /** The command's syntax, printed after the message. */
    readonly usage?: string,
  ) {
    super(message);
  }
}

/** The largest body the command reads; a settings body is a few KiB. */
const MAX_BODY_BYTES = 512 * 1024;

const tooLarge = () => new AppError(413, "payload_too_large", "The body is larger than 512 KiB");

/**
 * A body pasted into a terminal (docker compose exec -it): read in raw mode, so the
 * terminal shows nothing and does not cut a line at its 4 KiB limit. Ctrl-D
 * ends the body; Ctrl-C stops the command. A body over the limit is read to
 * its end without being kept, so that no part of it is shown.
 */
function readPasted(): Promise<Buffer> {
  const stdin = process.stdin as ReadStream;
  stdin.setRawMode(true);
  process.stderr.write("Paste the JSON body (it is not shown), then press Ctrl-D.\n");
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const finish = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stderr.write("\n");
      if (size > MAX_BODY_BYTES) reject(tooLarge());
      else resolve(Buffer.concat(chunks));
    };
    const onData = (chunk: Buffer) => {
      const end = chunk.indexOf(0x04);
      const cancel = chunk.indexOf(0x03);
      if (cancel !== -1 && (end === -1 || cancel < end)) {
        finish();
        process.exit(130);
      }
      const part = end === -1 ? chunk : chunk.subarray(0, end);
      size += part.length;
      if (size <= MAX_BODY_BYTES) chunks.push(part);
      else chunks.length = 0;
      if (end !== -1) finish();
    };
    stdin.on("data", onData);
    stdin.resume();
  });
}

async function readPiped(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw tooLarge();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function processIo(): CliIo {
  return {
    async readStdin() {
      const body = process.stdin.isTTY ? await readPasted() : await readPiped();
      // An editor may start the file with a byte order mark.
      return body.toString("utf8").replace(/^\uFEFF/, "");
    },
    out: (text) => void process.stdout.write(text),
    err: (text) => void process.stderr.write(text),
  };
}
