// npm audit for CI: fails on high and critical advisories in the production
// dependencies, except those listed below. Each exception says why it does
// not affect the support agent and when to look again; after that date it fails CI
// again. Moderate findings never fail CI (see .github/workflows/ci.yml).
import { execFileSync } from "node:child_process";

const print = (line) => process.stdout.write(`${line}\n`);
const warn = (line) => process.stderr.write(`${line}\n`);

// Each entry: { id: "GHSA-…", until: "YYYY-MM-DD", reason: "…" }.
const EXCEPTIONS = [];

const BLOCKING = new Set(["high", "critical"]);

let output;
try {
  output = execFileSync("npm", ["audit", "--omit=dev", "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (error) {
  // npm audit exits with 1 when it finds anything; the report is still on stdout.
  output = error.stdout;
}
const report = JSON.parse(output);
if (report.error) {
  warn(`npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`);
  process.exit(1);
}

// Advisories by URL; packages that are only affected through a dependency
// list that dependency's name instead of an advisory.
const advisories = new Map();
for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via) {
    if (typeof via === "object" && BLOCKING.has(via.severity)) advisories.set(via.url, via);
  }
}

const today = new Date().toISOString().slice(0, 10);
let failed = false;
for (const [url, advisory] of advisories) {
  const exception = EXCEPTIONS.find((candidate) => url.endsWith(`/${candidate.id}`));
  if (exception && today <= exception.until) {
    print(
      `Allowed until ${exception.until}: ${advisory.severity} ${advisory.name} ${url}. ${exception.reason}`,
    );
    continue;
  }
  failed = true;
  const expired = exception ? ` (exception expired on ${exception.until})` : "";
  warn(`${advisory.severity} ${advisory.name} ${advisory.range}: ${advisory.title} ${url}${expired}`);
}
for (const exception of EXCEPTIONS) {
  if (![...advisories.keys()].some((url) => url.endsWith(`/${exception.id}`))) {
    print(`Exception ${exception.id} is no longer needed; remove it from scripts/audit.mjs.`);
  }
}
if (failed) process.exit(1);
print(
  "npm audit: no high or critical advisories in the production dependencies, apart from the exceptions above.",
);
