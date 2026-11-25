import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AppEnv } from "./env";
import { config } from "../config";
import { SERVER_ROOT } from "../paths";
import { withErrorReportingSettings } from "../error-reporting";

/** The built web app (apps/web/dist): hashed assets, and index.html for every app route. */
export function webApp() {
  const root = config().WEB_DIST_DIR ?? path.resolve(SERVER_ROOT, "../web/dist");
  const relativeRoot = path.relative(process.cwd(), root) || ".";
  const app = new Hono<AppEnv>();
  // Source maps hold the app's source; the Deploy workflow's builds upload them to the
  // error reporting service, which needs no public copy.
  app.use("/assets/*", async (c, next) => (c.req.path.endsWith(".map") ? c.notFound() : next()));
  app.use(
    "/assets/*",
    serveStatic({
      root: relativeRoot,
      onFound: (_path, c) => {
        c.header("cache-control", "public, max-age=31536000, immutable");
      },
    }),
  );
  app.use("/favicon.svg", serveStatic({ root: relativeRoot }));
  let indexHtml: string | undefined;
  app.get("*", async (c) => {
    if (!c.req.header("accept")?.includes("text/html")) return c.notFound();
    try {
      indexHtml ??= withErrorReportingSettings(await readFile(path.join(root, "index.html"), "utf8"));
    } catch {
      return c.text("The web app is not built. Run `npm run build` or use the Vite dev server.", 503);
    }
    c.header("cache-control", "no-cache");
    return c.html(indexHtml);
  });
  return app;
}
