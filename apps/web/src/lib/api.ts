import type { ErrorBody } from "@support-agent/shared/api/common";

/** An error response of the API, with its status, code and field messages. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Messages by field path, e.g. `{ "config.url": "Enter a URL" }`. */
    readonly fields?: Record<string, string>,
    /** The parsed response body, for routes that answer errors with more than the reason. */
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Query = Record<string, string | number | boolean | null | undefined | string[]>;

/** Builds `/api/v1<path>?<query>`, skipping empty values and repeating array values. */
export function apiUrl(path: string, query?: Query): string {
  const url = new URL(`/api/v1${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) for (const item of value) url.searchParams.append(key, item);
    else url.searchParams.set(key, String(value));
  }
  return url.pathname + url.search;
}

let onUnauthorized: (() => void) | undefined;

/** Called when the session has ended (401), e.g. to show the sign-in page. */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

type RequestOptions = { query?: Query; body?: unknown; signal?: AbortSignal };

/** A request and its successful answer with its HTTP status; errors throw `ApiError`. */
async function send<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<{ status: number; data: T }> {
  const response = await fetch(apiUrl(path, options.query), {
    method,
    credentials: "same-origin",
    headers:
      options.body === undefined
        ? { accept: "application/json" }
        : { accept: "application/json", "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
  if (response.status === 204) return { status: 204, data: undefined as T };
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    // The status arrived, the body broke off: keep the status (a 202 still counts).
    throw new ApiError(response.status, "unreadable_body", errorMessage(error));
  }
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const body = data as { error?: Partial<ErrorBody["error"]> | string } | null;
    if (response.status === 401) onUnauthorized?.();
    // Most errors are `{ error: { code, message } }`; the update routes answer `{ error: "…", … }`.
    const error: Partial<ErrorBody["error"]> | undefined =
      typeof body?.error === "string" ? { message: body.error } : body?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "internal_error",
      error?.message ?? `Request failed (${response.status})`,
      error?.fields,
      data,
    );
  }
  return { status: response.status, data: data as T };
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  return (await send<T>(method, path, options)).data;
}

/** Typed calls to the REST API. Types come from @support-agent/shared/api/*. */
export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>("GET", path, { query, signal }),
  post: <T>(path: string, body?: unknown, query?: Query) =>
    request<T>("POST", path, { body: body ?? {}, query }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body: body ?? {} }),
  delete: <T = void>(path: string, query?: Query) => request<T>("DELETE", path, { query }),
  /** A POST whose answer status matters, e.g. 202 (accepted) against 200. */
  postWithStatus: <T>(path: string, body?: unknown) => send<T>("POST", path, { body: body ?? {} }),
};

/** A user-facing message for any error. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
