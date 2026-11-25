/*
 * The operator command, `cli` in the image (docs/deployment.md, "Settings
 * from the command line"): `cli settings …` sets what admins set in the
 * admin interface, with the same functions. Stdout carries only the
 * command's output; logs go to stderr. It starts no web server and no bot,
 * closes the database pool and exits. It starts no error reporting, so it
 * reports nothing to Sentry.
 */
import { logToStderr } from "./log-target";

logToStderr();
// Loaded only now: the logger reads the target when it loads.
const { runCli } = await import("./cli/main");
const { processIo } = await import("./cli/io");
const { closeDb } = await import("./db/client");

const code = await runCli(process.argv.slice(2), processIo());
await closeDb().catch(() => undefined);
// Exit only once the output is written: a pipe can take it slower than it comes.
const flushed = (stream: NodeJS.WriteStream) => new Promise((resolve) => stream.write("", resolve));
await Promise.all([flushed(process.stdout), flushed(process.stderr)]);
process.exit(code);
