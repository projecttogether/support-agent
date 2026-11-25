# Contributing

Support Agent is a Hono server and a React admin app in one repository (npm
workspaces). `AGENTS.md` has the layout and the code rules;
`docs/architecture.md` explains how the parts fit together. This file has
the setup and the checks.

## Development setup

You need Node.js 26 and Docker.

```sh
docker compose -f compose.dev.yaml up -d   # PostgreSQL 18 and a Keycloak for sign-in
cp .env.example .env.local
npm ci
npm run dev
```

Open http://localhost:5173 and sign in with `ada@example.org`, password
`support-agent-dev` (an admin through `ADMIN_EMAILS`). The Keycloak admin
console is at http://localhost:8096 (admin / admin).

`npm run dev` starts the Vite dev server for the admin app and the server
with `APP_ROLE=all`, so the Slack bot runs too. It stays idle until you
connect a Slack app in the admin interface; use a test workspace and a
separate Slack app for development.

`npm run cli -- settings list` runs the operator command against the
development database (`cli help` lists the commands).

## Checks

```sh
node scripts/check-public-repository.mjs
npm run lint
npm run format:check      # npm run format fixes it
npm run typecheck
npm test                  # unit tests
npm run test:integration  # needs the PostgreSQL of compose.dev.yaml
npm run build
```

CI (`.github/workflows/ci.yaml`) runs all of them, scans the history for
secrets, checks that the migrations match the schema, audits the production
dependencies (`scripts/audit.mjs`), and builds the Docker image and starts it
with `compose.yaml`.

## Database changes

Edit `apps/server/src/db/schema/`, run `npm run db:generate`, and commit the
generated migration in `apps/server/drizzle/`. Migrations run before the new
version starts (`migrate` service), and the previous version must keep
working on the migrated database (a deploy that fails puts it back): add
columns with defaults, don't rename in place.

## Tests

Unit tests sit next to the code (`*.test.ts`). Integration tests
(`*.int.test.ts`) get a fresh database (`TEST_DATABASE_URL`, default
`support_agent_test` on the development PostgreSQL). Tests never call real
model providers or Slack: use `setLlmClientFactoryForTests` and stub
`fetch`.

## Pull requests

Write the title as one plain line of what changes. Label a pull request
`breaking` when the people who run the support agent must act on it, and
describe the steps in it. Update the docs when behavior or configuration
changes.

## Builds and deploys

Every commit on `main` that passes CI is built and deployed; there are no
releases (`docs/deployment.md`, Builds and deploys). The Deploy workflow
uploads the source maps to the Sentry project
`projecttogether/support-agent` with the secret `SENTRY_AUTH_TOKEN`
(Dockerfile); without the secret, it uploads nothing.

## Data, secrets and privacy

Never commit secrets, real personal data or data from a real organization,
also not in tests and fixtures. Use `example.org` addresses and invented
content. `scripts/check-public-repository.mjs` rejects private file types,
unknown hosts and email domains, internal names and token formats; add a
host there only when it is public and intended.
