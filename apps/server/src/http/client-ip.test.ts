import { describe, expect, it } from "vitest";
import { forwardedClient } from "./client-ip";

describe("forwardedClient", () => {
  it("takes the entry the trusted proxies added, not what the client sent", () => {
    expect(forwardedClient("203.0.113.9", 1)).toBe("203.0.113.9");
    // A client-supplied header that the proxy appended to.
    expect(forwardedClient("10.0.0.1, 203.0.113.9", 1)).toBe("203.0.113.9");
    expect(forwardedClient("10.0.0.1, 203.0.113.9, 198.51.100.2", 2)).toBe("203.0.113.9");
  });

  it("ignores the header without trusted proxies or with too few entries", () => {
    expect(forwardedClient("203.0.113.9", 0)).toBeNull();
    expect(forwardedClient("203.0.113.9", 2)).toBeNull();
    expect(forwardedClient(null, 1)).toBeNull();
    expect(forwardedClient(" , ", 1)).toBeNull();
  });
});
