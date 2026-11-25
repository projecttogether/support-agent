import { describe, expect, it } from "vitest";
import { createApp } from "./app";

describe("request body limits", () => {
  it("rejects oversized sign-in bodies before passing them to the auth handler", async () => {
    const app = createApp();
    const bytes = new Uint8Array(64 * 1024 + 1);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const response = await app.request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body,
      duplex: "half",
    } as RequestInit);
    expect(response.status).toBe(413);
  });

  it("does not read an unauthenticated API request body", async () => {
    const app = createApp();
    const response = await app.request("/api/v1/agents/preview", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-length": String(25 * 1024 * 1024) },
      body: "{}",
    });
    expect(response.status).toBe(401);
  });
});
