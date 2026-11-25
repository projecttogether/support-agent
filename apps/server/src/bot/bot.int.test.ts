import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../db/client";
import { botStatus } from "../db/schema";
import { resetDatabase } from "../test/helpers";
import { otherBotAlive } from "./bot";

beforeEach(async () => {
  await resetDatabase();
});

describe("otherBotAlive", () => {
  it("counts other bot processes that reported recently and are connected or connecting", async () => {
    const now = Date.now();
    const report = (instanceId: string, state: string, secondsAgo: number) => ({
      instanceId,
      state,
      startedAt: new Date(now - 600_000),
      lastHeartbeatAt: new Date(now - secondsAgo * 1000),
    });
    const db = getDb();
    await db.insert(botStatus).values([report("me", "connected", 1), report("stopped", "disconnected", 1)]);
    expect(await otherBotAlive(db, "me", now)).toBe(false);

    await db.insert(botStatus).values(report("crashed", "connected", 90));
    expect(await otherBotAlive(db, "me", now)).toBe(false);

    await db.insert(botStatus).values(report("running", "connecting", 10));
    expect(await otherBotAlive(db, "me", now)).toBe(true);
  });
});
