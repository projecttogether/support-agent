# AGENTS.md

Support Agent is ProjectTogether's open-source Slack support bot: agents answer
questions in Slack channels from knowledge sources (HTTP search APIs), with
links to the sources. Admins configure providers, knowledge sources, Slack and
agents in a web admin interface. User documentation is in `docs/`;
contributor setup is in `CONTRIBUTING.md`; how it works inside is in
`docs/architecture.md`.

## Stack

npm workspaces, Node.js 26, strict TypeScript.

- `apps/server`: Hono (admin API under `/api/v1`), Better Auth (OIDC sign-in
  under `/api/auth`), Drizzle ORM on PostgreSQL, the Slack bot (Socket Mode),
  model adapters (Anthropic SDK; OpenAI SDK for OpenAI, Mistral and
  OpenAI-compatible APIs), pino logs, Vitest.
- `apps/web`: Vite + React 19 admin app, TanStack Router and Query,
  Tailwind CSS 4, react-hook-form with zod, en + de.
  `src/components/ui/` holds the components (shadcn/ui and Radix), the app
  frame, the page layout, the sign-in page and the theme with
  ProjectTogether's colors (`styles.css`); `src/components/brand.tsx` the app
  icon and ProjectTogether's logo.
- `packages/shared` (`@support-agent/shared/*`): zod schemas of the API
  (`api/*.ts`), roles, error report redaction. Both apps use them.

One Docker image runs every process: `APP_ROLE` = `all | web | bot | migrate`;
its command `cli …` runs the operator command (`cli settings`).

## Layout

```
apps/server/src/
  main.ts          entry; APP_ROLE selects the processes
  cli.ts           entry of the operator command; cli/ has one module per setting name
  config.ts        every environment variable (zod); read only via config()
  db/schema/       Drizzle schema (auth.ts, app.ts); db/client.ts, db/migrate.ts
  auth/            Better Auth, session → principal, ADMIN_EMAILS
  http/            app factory, middleware (requireUser/requireAdmin, jsonBody), errors, static web app
  modules/         one file per API area: routes plus their service code
  core/            crypto (secrets), settings, audit, config-change NOTIFY
  llm/             LlmClient, Anthropic and OpenAI-compatible adapters, generateJson
  knowledge/       search API connector (templates, auth, response mapping)
  agent/           pipeline (triage → search → answer), reply, prompts, Slack formatting, runtime loading
  bot/             Socket Mode process (stop, resuming after a restart), message handler, Slack port,
                   config store, maintenance
  slack/           Web API helpers, app manifest
apps/web/src/      admin app; components/ui/ the components and the frame, modules/<area> the pages
packages/shared/src/api/  request and response schemas
scripts/           build helpers, the dependency audit, the public repository check
```

## Rules

- **Contracts first.** Change a request or response in
  `packages/shared/src/api/` and use it on both sides; routes validate input
  with it (`jsonBody`, `queryOf`).
- **Access:** every route calls `requireUser(c)` or `requireAdmin(c)` first.
  Providers, keys, Slack, users, settings and the audit log are admin-only.
- **Secrets** (API keys, tokens, search secrets) are stored with
  `encryptSecret` and never returned or logged; responses show `secretHint`.
  Audit summaries never contain secrets.
- **Configuration changes** the bot uses (agents, providers, sources, Slack,
  settings) call `notifyConfigChanged(tx)` in their transaction.
- **Settings** of the admin pages (providers, knowledge sources, Slack,
  agents, settings) are saved by exported service functions in `modules/`
  that the routes and `cli settings` both call, with an `Actor`; a new
  setting gets a module in `cli/` too. The command takes secrets only on
  stdin.
- **The bot must keep working** when the admin interface or the database
  hiccups: no new dependency of the bot on the web process; keep the last
  good configuration; time-limit every outside call.
- **Restarts:** a deploy may restart the bot at any time. A message the agent
  takes on gets its exchange first (outcome `pending`); its outcome is stored
  before the reply is posted; the next bot process resumes pending
  exchanges (`resumeExchange`). Keep that order when changing how messages
  are handled ([Architecture](docs/architecture.md#restarts-and-deploys)).
- **Answers are grounded:** the answer step gets only the found passages and
  the instructions; the posted links come from the cited passages, never from
  model text (`agent/reply.ts` renders every reply). Keep it that way.
- **Environment variables:** document each in `docs/configuration.md`. An
  app setting (not one of the server settings in `docs/deployment.md`,
  Settings) also needs a line in the Deploy workflow's `SETTINGS`.
- **Design:** ProjectTogether's colors and app identity (PT Sky for buttons,
  focus and selected states, with PT Ocean text on it; links in the darker
  `--link`); the tokens are in `apps/web/src/components/ui/styles.css`.
  Keep components close to shadcn/ui; their texts have English and German.
- **Errors:** throw `AppError` helpers (`http/errors.ts`) with short, plain
  messages. Model and search failures become `LlmError` / `SearchError` with
  messages an admin can act on, without response bodies or keys.
- **Logging:** `logger` with ids and codes; never message texts, answers,
  tokens or personal data. No `console.*`, no `any`.
- **Privacy:** exchanges store question/answer texts only while
  `retentionDays > 0`; `runMaintenance` removes them after the period.

## Database

Change the schema in `apps/server/src/db/schema/`, then run
`npm run db:generate` and commit the migration. CI fails when they differ.
The running installation's database must keep working: add only migrations
that the previous version survives (new columns with a default), and only
when needed.

## Tests

- Unit tests next to the code (`*.test.ts`); integration tests
  (`*.int.test.ts`) use the PostgreSQL of `compose.dev.yaml` and
  `src/test/helpers.ts` (`resetDatabase`, `createUser`, `request`).
- Model calls in tests: `setLlmClientFactoryForTests` with a fake client;
  knowledge searches: stub `fetch`. Never call real providers or Slack in
  tests.

## Commands

```sh
docker compose -f compose.dev.yaml up -d   # PostgreSQL (55436) and Keycloak (8096)
cp .env.example .env.local
npm ci
npm run dev                                # admin app http://localhost:5173, server :3000 (web + bot)

node scripts/check-public-repository.mjs
npm run lint && npm run format:check && npm run typecheck && npm test
npm run test:integration
npm run build
```

Deploys: every commit on `main` that passes CI is built and deployed
(`docs/deployment.md`, Builds and deploys). No file holds the version.

## Content

UI text is English with German translations; short and plain. Never commit
secrets, real personal data or data from a real organization: use
`example.org` addresses and invented content. Keep ProjectTogether's
internals (server names, addresses, internal domains, people, vault names)
out of this repository; they belong in its infrastructure repository.
