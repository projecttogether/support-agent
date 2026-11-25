import { NO_DATA_COLLECTION, redactErrorReport } from "@support-agent/shared/error-reports";

/**
 * Reports of web app errors to Sentry, only when the server sets SENTRY_DSN:
 * it passes the settings in index.html, and the SDK loads only then.
 * `redactErrorReport` decides what a report keeps.
 */
type Settings = { dsn: string; environment: string; release?: string };

let report: ((error: unknown) => void) | undefined;
/** Errors caught while the SDK loads, for example during the first render. */
let pending: unknown[] | undefined;

function readSettings(): Settings | undefined {
  const content = document.querySelector<HTMLMetaElement>(
    'meta[name="support-agent-error-reporting"]',
  )?.content;
  if (!content) return undefined;
  try {
    return JSON.parse(content) as Settings;
  } catch {
    return undefined;
  }
}

/** `currentRoute` names the route in reports, e.g. `/agents/$agentId`, never the address. */
export async function startErrorReporting(currentRoute: () => string | undefined) {
  const settings = readSettings();
  if (!settings) return;
  pending = [];
  const { init, captureException, dedupeIntegration, globalHandlersIntegration, linkedErrorsIntegration } =
    await import("@sentry/browser");
  init({
    ...settings,
    // Only uncaught errors: no breadcrumbs, request data, sessions or wrapped browser APIs.
    defaultIntegrations: false,
    integrations: [globalHandlersIntegration(), linkedErrorsIntegration(), dedupeIntegration()],
    dataCollection: NO_DATA_COLLECTION,
    maxBreadcrumbs: 0,
    beforeSend: (event) => {
      // The server reports failed API requests itself.
      if (event.exception?.values?.some((value) => value.type === "ApiError")) return null;
      return { ...redactErrorReport(event), transaction: currentRoute() };
    },
  });
  report = (error) => captureException(error);
  for (const error of pending.splice(0)) report(error);
}

/** Errors that an error screen (error boundary) caught; they never reach `window.onerror`. */
export function reportCaughtError(error: unknown) {
  if (report) report(error);
  else pending?.push(error);
}
