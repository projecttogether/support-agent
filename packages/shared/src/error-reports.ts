/**
 * What an error report to Sentry may contain, on the server and in the web
 * app: the error type, code locations (with the debug IDs that link them to
 * the uploaded source maps), where it happened, and the server's own log
 * message with its ids and codes. Everything else is removed: error
 * messages (database errors quote values), request data, people, local
 * variables and breadcrumbs can all hold personal data.
 */

const KEPT_FIELDS = new Set([
  "contexts",
  "environment",
  "event_id",
  "exception",
  "fingerprint",
  "level",
  "logger",
  "platform",
  "release",
  "sdk",
  "server_name",
  "tags",
  "timestamp",
  "transaction",
]);
const KEPT_CONTEXTS = new Set(["browser", "os", "runtime", "trace"]);
const KEPT_FRAME_FIELDS = new Set([
  "abs_path",
  "colno",
  "context_line",
  "filename",
  "function",
  "in_app",
  "lineno",
  "module",
  "post_context",
  "pre_context",
]);
/** A debug image links a bundle (`code_file`, as in the frames) to its source map. */
const KEPT_IMAGE_FIELDS = new Set(["code_file", "debug_id", "type"]);
/**
 * Fields of a logged error (the `pino` context). Server logs carry ids and
 * codes, never personal data; `path` and validation issues can, so they go.
 */
const KEPT_LOG_FIELD = /^(msg|route|task|code|action|[a-z]+Id)$/;

/** SDK option `dataCollection`: collect nothing about people, requests or variables. */
export const NO_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
};

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const pick = (fields: Fields, keep: (key: string) => boolean): Fields =>
  Object.fromEntries(Object.entries(fields).filter(([key]) => keep(key)));

/**
 * A web address in a frame keeps only a script file. Without a stack, the
 * browser SDK names the page instead, and page addresses can hold invitation
 * tokens or search terms.
 */
function codeLocation(location: unknown) {
  if (typeof location !== "string" || !/^[a-z][\w+.-]*:\/\//i.test(location)) return location;
  try {
    const url = new URL(location);
    return /\.m?js$/.test(url.pathname) ? url.origin + url.pathname : url.origin;
  } catch {
    return undefined;
  }
}

export function redactErrorReport<T extends object>(event: T): T {
  const report = pick(event as Fields, (key) => KEPT_FIELDS.has(key));
  if (isFields(report.contexts)) {
    const contexts = pick(report.contexts, (key) => KEPT_CONTEXTS.has(key));
    if (isFields(report.contexts.pino)) {
      const log = pick(report.contexts.pino, (key) => KEPT_LOG_FIELD.test(key));
      contexts.pino = log;
      // The server's log message; any other event message can quote data.
      if (typeof log.msg === "string") report.message = log.msg;
    }
    report.contexts = contexts;
  }
  if (isFields(report.exception) && Array.isArray(report.exception.values)) {
    report.exception = {
      values: report.exception.values.filter(isFields).map(({ value: _value, stacktrace, ...exception }) => {
        if (!isFields(stacktrace) || !Array.isArray(stacktrace.frames)) return exception;
        const frames = stacktrace.frames.filter(isFields).map((frame) => {
          const kept = pick(frame, (key) => KEPT_FRAME_FIELDS.has(key));
          for (const key of ["filename", "abs_path"]) if (key in kept) kept[key] = codeLocation(kept[key]);
          return kept;
        });
        return { ...exception, stacktrace: { frames } };
      }),
    };
  }
  const debugMeta = (event as Fields).debug_meta;
  if (isFields(debugMeta) && Array.isArray(debugMeta.images)) {
    report.debug_meta = {
      images: debugMeta.images.filter(isFields).map((image) => {
        const kept = pick(image, (key) => KEPT_IMAGE_FIELDS.has(key));
        if ("code_file" in kept) kept.code_file = codeLocation(kept.code_file);
        return kept;
      }),
    };
  }
  return report as T;
}
