import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
/** In the bundle this file is in dist/, or in dist/chunks/ when entry points (main, cli) share it. */
const top = path.basename(here) === "chunks" ? path.dirname(here) : here;

/**
 * True when running the production bundle (dist/main.mjs), false when
 * running the TypeScript sources (development, tests).
 */
export const IS_BUNDLED = path.basename(top) === "dist";

/** apps/server: this file lives in src/ and is bundled into dist/, both one level below. */
export const SERVER_ROOT = path.resolve(top, "..");
