import { serve } from "@hono/node-server";
import { config } from "./config";
import { logger } from "./logger";
import { closeDb, getDb } from "./db/client";
import { runMigrations } from "./db/migrate";
import { createApp } from "./http/app";
import { ensureEnvironmentAdmins } from "./auth/bootstrap";
import { Bot } from "./bot/bot";
import { flushErrorReports, startErrorReporting } from "./error-reporting";

/**
 * One entry point for every process. APP_ROLE selects what runs:
 *   all      admin interface and Slack bot (default, simplest deployment)
 *   web      admin interface only
 *   bot      Slack bot only (keeps answering when the admin interface is down)
 *   migrate  apply database migrations, then exit
 */
async function main() {
  const settings = config();
  startErrorReporting();
  const role = settings.APP_ROLE;
  if (role === "migrate") {
    await runMigrations();
    await closeDb();
    return;
  }
  if (settings.RUN_MIGRATIONS) await runMigrations();
  let server: ReturnType<typeof serve> | undefined;
  let bot: Bot | undefined;
  if (role === "all" || role === "web") {
    await ensureEnvironmentAdmins(getDb());
    const app = createApp();
    server = serve({ fetch: app.fetch, port: settings.PORT, hostname: settings.HOST }, (info) => {
      logger.info({ port: info.port, url: settings.APP_URL }, "admin interface listening");
    });
  }
  if (role === "all" || role === "bot") {
    bot = new Bot();
    await bot.start();
  }
  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "shutting down");
    await Promise.allSettled([
      server ? new Promise<void>((resolve) => server!.close(() => resolve())) : Promise.resolve(),
      bot?.stop(),
    ]);
    await closeDb();
    await flushErrorReports();
    process.exit(typeof process.exitCode === "number" ? process.exitCode : 0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
}

main().catch(async (error: unknown) => {
  logger.fatal({ err: error }, "startup failed");
  await flushErrorReports();
  process.exit(1);
});
