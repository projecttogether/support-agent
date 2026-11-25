import * as Sentry from "@sentry/node";
import { NO_DATA_COLLECTION, redactErrorReport } from "@support-agent/shared/error-reports";
import { config, type Config } from "./config";

/** The release in reports: SENTRY_RELEASE, else `support-agent@<APP_VERSION>` for the Deploy workflow's images. */
export function errorReportRelease(settings: Pick<Config, "SENTRY_RELEASE" | "APP_VERSION">) {
  return (
    settings.SENTRY_RELEASE ?? (settings.APP_VERSION ? `support-agent@${settings.APP_VERSION}` : undefined)
  );
}

/**
 * Error reports to Sentry or a compatible service, off unless SENTRY_DSN is
 * set. Errors logged at `error` or `fatal` become reports, and so do crashes.
 * `redactErrorReport` decides what a report keeps: no request data, people or message texts.
 */
export function startErrorReporting() {
  const settings = config();
  if (!settings.SENTRY_DSN) return;
  Sentry.init({
    dsn: settings.SENTRY_DSN,
    environment: settings.SENTRY_ENVIRONMENT ?? settings.NODE_ENV,
    release: errorReportRelease(settings),
    defaultIntegrations: false,
    enableRuntimeChannelInjection: false,
    integrations: [
      Sentry.pinoIntegration({ error: { levels: ["error", "fatal"] }, log: { levels: [] } }),
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration({ mode: "strict" }),
      Sentry.linkedErrorsIntegration(),
      Sentry.nodeContextIntegration(),
      Sentry.contextLinesIntegration(),
    ],
    dataCollection: NO_DATA_COLLECTION,
    maxBreadcrumbs: 0,
    beforeSend: (event) => {
      const report = redactErrorReport(event);
      // Failed requests log their route pattern, e.g. `GET /api/v1/agents/:id`.
      const route = report.contexts?.pino?.route;
      if (typeof route === "string") report.transaction = route;
      return report;
    },
  });
  Sentry.getGlobalScope().setTag("role", settings.APP_ROLE);
}

/** Sends pending reports; call it before the process exits. */
export const flushErrorReports = () => Sentry.flush(2000);

/** Where browsers send web app reports, for the Content-Security-Policy. */
export function errorReportingSources(): string[] {
  const dsn = config().SENTRY_DSN;
  return dsn ? [new URL(dsn).origin] : [];
}

const ATTRIBUTE_ESCAPES: Record<string, string> = { "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" };

/** Adds the web app's report settings to index.html; the web app reports only with them. */
export function withErrorReportingSettings(indexHtml: string): string {
  const settings = config();
  if (!settings.SENTRY_DSN) return indexHtml;
  const content = JSON.stringify({
    dsn: settings.SENTRY_DSN,
    environment: settings.SENTRY_ENVIRONMENT ?? settings.NODE_ENV,
    release: errorReportRelease(settings),
  }).replace(/[&"<>]/g, (character) => ATTRIBUTE_ESCAPES[character]!);
  return indexHtml.replace(
    "</head>",
    `<meta name="support-agent-error-reporting" content="${content}" />\n</head>`,
  );
}
