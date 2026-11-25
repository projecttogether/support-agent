import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { config } from "../config";

/** Request header carrying the client IP from the app to the authentication library. */
export const CLIENT_IP_HEADER = "x-support-agent-client-ip";

/**
 * The client address in an X-Forwarded-For header behind `hops` trusted
 * proxies. Each proxy appends the address it received the request from, so
 * the client is the `hops`-th entry from the right; entries further left
 * come from the client itself and can be forged.
 */
export function forwardedClient(header: string | null | undefined, hops: number): string | null {
  if (!header || hops < 1) return null;
  const entries = header
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.length >= hops ? entries[entries.length - hops]! : null;
}

/** The client's IP address: from X-Forwarded-For behind trusted proxies (TRUST_PROXY), else the socket address. */
export function clientIp(c: Context): string | null {
  const forwarded = forwardedClient(c.req.header("x-forwarded-for"), config().TRUST_PROXY);
  if (forwarded) return forwarded;
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}
