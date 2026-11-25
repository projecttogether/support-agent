import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetConfigForTests } from "../config";
import { webApp } from "./static";

describe("webApp", () => {
  const dist = mkdtempSync(path.join(tmpdir(), "support-agent-web-"));
  const saved = process.env.WEB_DIST_DIR;

  beforeAll(() => {
    mkdirSync(path.join(dist, "assets"));
    writeFileSync(path.join(dist, "index.html"), "<html><head></head><body></body></html>");
    writeFileSync(
      path.join(dist, "assets/index-abc.js"),
      "console.log(1);\n//# sourceMappingURL=index-abc.js.map",
    );
    writeFileSync(path.join(dist, "assets/index-abc.js.map"), '{"version":3,"sources":["app.tsx"]}');
    process.env.WEB_DIST_DIR = dist;
    resetConfigForTests();
  });

  afterAll(() => {
    if (saved === undefined) delete process.env.WEB_DIST_DIR;
    else process.env.WEB_DIST_DIR = saved;
    resetConfigForTests();
    rmSync(dist, { recursive: true, force: true });
  });

  it("serves the assets but not their source maps", async () => {
    const app = webApp();
    expect((await app.request("/assets/index-abc.js")).status).toBe(200);
    expect((await app.request("/assets/index-abc.js.map")).status).toBe(404);
    expect((await app.request("/assets/index-abc.js%2Emap")).status).toBe(404);
  });
});
