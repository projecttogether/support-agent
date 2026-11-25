// Bundles the server into dist/main.mjs, and the operator command into
// dist/cli.mjs; code both use goes into dist/chunks/. npm dependencies stay
// external (they are installed in the image); the workspace package
// (@support-agent/shared) and the imported devDependency @sentry/node are bundled.
import { build } from "esbuild";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith("@support-agent/"));

await rm(path.join(root, "dist"), { recursive: true, force: true });
await build({
  entryPoints: { main: path.join(root, "src/main.ts"), cli: path.join(root, "src/cli.ts") },
  outdir: path.join(root, "dist"),
  outExtension: { ".js": ".mjs" },
  // One copy of the code both entry points use.
  splitting: true,
  chunkNames: "chunks/[name]-[hash]",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node26",
  external,
  sourcemap: true,
  legalComments: "none",
  logLevel: "info",
  // Some dependencies still call require(); give the ESM bundle one.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
