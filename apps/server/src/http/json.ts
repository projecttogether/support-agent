import type { z } from "zod";
import { AppError, badRequest, parseWith } from "./errors";

/**
 * A JSON text validated with a shared schema: the body of an API request, or
 * the body that `cli settings apply` reads from stdin.
 */
export function parseJsonBody<T extends z.ZodType>(text: string, schema: T): z.infer<T> {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw badRequest("The request body must be JSON");
  }
  return parseWith(schema, body);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An ID of a route or of `cli settings … --id`: a UUID, or 404 like an unknown ID. */
export function entityId(value: string | undefined): string {
  if (!value || !UUID.test(value)) throw new AppError(404, "not_found", "Not found");
  return value.toLowerCase();
}
