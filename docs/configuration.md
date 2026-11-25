# Configuration

The environment holds what the processes need to start: the database, the
secrets, sign-in and the bot's limits, set in `.env` next to `compose.yaml`.
Everything else (Slack, model providers, knowledge sources, agents,
retention) is stored in the database and set in the admin interface, or on
the server with `cli settings`
([Settings from the command line](deployment.md#settings-from-the-command-line)).
Where the Deploy workflow deploys the app, the server writes the server
settings and the workflow sends the others ([Settings](deployment.md#settings)).

Blank values count as unset. A missing or invalid required value stops the
process with a list of the problems.

## Required

| Variable             | Description                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection URL, e.g. `postgres://support_agent:…@postgres:5432/support_agent`.                                                                |
| `APP_URL`            | Public URL of the admin interface, e.g. `https://support.example.org`. Sign-in redirects and the cross-site check use it.                                |
| `AUTH_SECRET`        | Signs sessions. At least 32 characters: `openssl rand -base64 32`.                                                                                       |
| `ENCRYPTION_KEY`     | Encrypts the stored API keys and tokens. 32 bytes, base64: `openssl rand -base64 32`. **Back it up:** without it, the stored keys must be entered again. |
| `OIDC_ISSUER`        | Issuer URL of the OpenID Connect provider (see [Deployment](deployment.md#sign-in)).                                                                     |
| `OIDC_CLIENT_ID`     | Client ID at that provider.                                                                                                                              |
| `OIDC_CLIENT_SECRET` | Client secret at that provider.                                                                                                                          |

The `AUTH_SECRET` and `ENCRYPTION_KEY` of `.env.example` are public. The
process refuses them unless it runs for development on this machine
(`NODE_ENV` is not `production` and `APP_URL` is a `localhost` address).

## Sign-in

| Variable             | Default                | Description                                                                                            |
| -------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `ADMIN_EMAILS`       | empty                  | Comma-separated email addresses that are always active admins. Set at least one for the first sign-in. |
| `OIDC_PROVIDER_NAME` | `single sign-on`       | Shown on the sign-in button: "Sign in with …".                                                         |
| `OIDC_SCOPES`        | `openid email profile` | Requested scopes.                                                                                      |
| `OIDC_PKCE`          | `true`                 | Proof Key for Code Exchange. Turn it off only for a provider that rejects it.                          |

## Processes

| Variable                  | Default            | Description                                                                                                                 |
| ------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `APP_ROLE`                | `all`              | `all`, `web`, `bot` or `migrate`. The image's command sets it.                                                              |
| `PORT` / `HOST`           | `3000` / `0.0.0.0` | Where the admin interface listens.                                                                                          |
| `SUPPORT_AGENT_PORT`      | `3000`             | Compose only: the host port on `127.0.0.1`.                                                                                 |
| `SUPPORT_AGENT_IMAGE_TAG` | `latest`           | Compose only: the image to run, `latest` (the newest commit on `main`) or `sha-<commit>` for one build.                     |
| `TZ`                      | `UTC`              | The time zone of the processes. The app keeps and logs times in UTC; nothing depends on it.                                 |
| `APP_NAME`                | `Support Agent`    | Name in the admin interface and the default name of the Slack app.                                                          |
| `TRUST_PROXY`             | `0`                | Reverse proxies in front of the app: `true` (one), a number of hops, or `false`. `compose.yaml` sets `true`.                |
| `RUN_MIGRATIONS`          | `false`            | Apply migrations when a process starts (single-container setups). `compose.yaml` runs a separate `migrate` service instead. |
| `DATABASE_POOL_SIZE`      | `10`               | Database connections per process.                                                                                           |
| `LOG_LEVEL`               | `info`             | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`. Logs are JSON lines on standard output.                     |

## Bot

| Variable               | Default                                   | Description                                                                                                                |
| ---------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `BOT_WATCHDOG_SECONDS` | `300`                                     | The bot exits when Slack stays unreachable this long, so the platform restarts it. `0` turns the watchdog off.             |
| `BOT_HEARTBEAT_FILE`   | unset (`/tmp/bot-heartbeat` in the image) | Touched every 30 seconds while the bot is connected to Slack (or Slack is not set up yet), for the container health check. |
| `BOT_CONCURRENCY`      | `4`                                       | Messages the bot works on at the same time.                                                                                |

## Error reports

| Variable             | Description                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `SENTRY_DSN`         | Send error reports to Sentry or a compatible service. Off when unset. Reports carry no message texts or keys. |
| `SENTRY_ENVIRONMENT` | Environment name in reports; defaults to `NODE_ENV`.                                                          |
| `SENTRY_RELEASE`     | Release name in reports; defaults to `support-agent@<APP_VERSION>`.                                           |

`APP_VERSION` is set by the Deploy workflow: the first 12 characters of the
commit the image was built from. The overview page and **My settings →
About** show it. Images built from source have none.

Reports name lines in the TypeScript sources when Sentry has the build's
source maps. The Deploy workflow uploads them to ProjectTogether's Sentry
project when the secret `SENTRY_AUTH_TOKEN` is set; for your own Sentry
project, upload them from the image (`/app/apps/server/dist` and
`/app/apps/web/dist`) with `npx sentry sourcemap upload <directory>` and
`SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` set. Sentry matches
them by the debug IDs in the bundles. Code mappings `/app/` (server) and
`app:///` (web app), each to the repository root, link the lines to the code.

## Development only

`WEB_DIST_DIR` and `MIGRATIONS_DIR` override where the built web app and the
migrations are found. `SLACK_API_URL` replaces Slack's Web API base URL, for
tests against a stand-in. `NODE_ENV` is `production` in the image.
