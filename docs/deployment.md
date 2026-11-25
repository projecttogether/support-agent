# Deployment

For the person who runs the support agent on a Linux server, such as a VPS
with Debian or Ubuntu: requirements, [setup](#setup),
[settings from the command line](#settings-from-the-command-line), sign-in,
[upgrades](#upgrades), [builds and deploys](#builds-and-deploys), backups
and troubleshooting. Every environment variable is described in
[Configuration](configuration.md); setting up Slack, models and agents
happens afterwards in the admin interface ([Admin guide](admin-guide.md)) or
on the server with `cli settings`.

## Requirements

- **A server with Debian 12 or later** (or a similar system with systemd and
  apt, such as Ubuntu 24.04), with Docker Engine and its Compose plugin, and
  a domain name that points at it.
- **PostgreSQL 16 or later**, the only stateful dependency: a database of
  your own, or the one `compose.postgres.yaml` adds.
- **Caddy** (or another reverse proxy on the server) that terminates HTTPS
  for the admin interface. The bot needs no public address: it opens an
  outgoing connection to Slack.
- **An OpenID Connect provider** for sign-in: Keycloak, Microsoft Entra ID,
  Google, or "Sign in with Slack".
- Outgoing HTTPS to Slack, to the model providers and to the knowledge
  sources.

## What runs

The [Deploy workflow](#builds-and-deploys) builds the image
`ghcr.io/projecttogether/support-agent` (linux/amd64) from every commit on
`main` that passes CI, tagged `sha-<commit>` and `latest`. There are no
numbered releases: the commit is the version. `SUPPORT_AGENT_IMAGE_TAG` in
`.env` picks the image: `latest` (the default) or `sha-<commit>` for one
build.

| File                    | Contains                                                                       |
| ----------------------- | ------------------------------------------------------------------------------ |
| `Dockerfile`            | The image. Its command (`all`, `web`, `bot`, `migrate`, `cli`) picks the role. |
| `compose.yaml`          | A one-off `migrate`, the admin interface (`web`) and the Slack bot (`bot`).    |
| `compose.postgres.yaml` | Adds a PostgreSQL 18 container, for servers without a database of their own.   |

- **`web`** serves the admin interface and its API.
- **`bot`** holds the Slack connection and answers. Run exactly one `bot`:
  after a restart it takes up the messages that bot processes before it left
  unfinished, and it waits while another one still reports
  ([Architecture](architecture.md#restarts-and-deploys)).

The image runs as an unprivileged user (uid 1000) and keeps nothing on disk:
the database is the only state. `web` listens on port 3000, published on
`127.0.0.1:3000` for a reverse proxy on the same machine. When another
service holds that port (Docker reports `port is already allocated`), set
`SUPPORT_AGENT_PORT` to a free one. With several apps on one server, give
each its own port and its own site in the Caddyfile. With
`compose.postgres.yaml`, the database lives in the named volume `postgres`.

### One container

Platforms that run a single image (no Compose) can use the command `all`
with `RUN_MIGRATIONS=true`: the admin interface and the bot then share one
process. Give the container a stop timeout of a minute, as `compose.yaml`
gives `bot`. Separate `web` and `bot` containers are more robust: the bot
keeps answering while the admin interface is redeployed.

## Setup

On a server with Debian 12 or later, or a similar system such as Ubuntu,
run the commands as root (`sudo -i`).

1. **Docker:** install Docker Engine and the Compose plugin from Docker's
   apt repository ([Debian](https://docs.docker.com/engine/install/debian/),
   [Ubuntu](https://docs.docker.com/engine/install/ubuntu/)), and Git:
   `apt install git`.
2. **Get the files:**

   ```sh
   git clone https://github.com/projecttogether/support-agent.git /srv/support-agent
   cd /srv/support-agent
   ```

3. **Register the app at your provider** with the redirect URL
   `<APP_URL>/api/auth/callback/oidc` ([Sign-in](#sign-in)).
4. **Create `.env`** from `.env.example` (`cp .env.example .env`,
   `chmod 600 .env`) and set production values: `APP_URL`, `DATABASE_URL`,
   new secrets (`openssl rand -base64 32` for `AUTH_SECRET` and
   `ENCRYPTION_KEY`), the `OIDC_*` values and your address in
   `ADMIN_EMAILS`. Remove `NODE_ENV=development` and `RUN_MIGRATIONS`.
   Without a database of your own, add
   `COMPOSE_FILE=compose.yaml:compose.postgres.yaml`, a `POSTGRES_PASSWORD`
   (`openssl rand -hex 32`) and
   `DATABASE_URL=postgres://support_agent:<POSTGRES_PASSWORD>@postgres:5432/support_agent`.
   Keep a copy of `ENCRYPTION_KEY` apart from the server: it opens the keys
   and tokens the database stores.
5. **Start:** `docker compose up -d --pull always`.
6. **HTTPS:** point the domain's DNS at the server, install Caddy
   (`apt install caddy`), and put this site into `/etc/caddy/Caddyfile`, in
   place of the package's example site `:80` and next to the sites of other
   apps:

   ```text
   support.example.org {
   	reverse_proxy 127.0.0.1:3000
   }
   ```

   Then `systemctl reload caddy`. Caddy gets the certificate itself. With
   `SUPPORT_AGENT_PORT` set, use that port instead of 3000.

7. Open `APP_URL` and sign in with an address from `ADMIN_EMAILS`.
8. **Continue in the admin interface:** the overview page lists the steps
   (Slack, a provider, a knowledge source, an agent). They can also be
   taken on the server instead:
   [Settings from the command line](#settings-from-the-command-line).

## Settings from the command line

What admins set in the admin interface (providers, knowledge sources,
Slack, agents and the Settings page) can also be set on the server, without
a browser, with `cli settings`. It runs the same code as the pages: the same
checks, the same encryption, the same reload of the bot, and an entry in the
audit log with the actor `operator` and the command. In `/srv/support-agent`:

```sh
docker compose run --rm -T migrate cli settings list
```

In a running container, the command is just `cli …`
(`docker compose exec web cli settings list`).

| Command                                                        | What it does                                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `cli settings list [--json]`                                   | Each setting and each entry of a list with its ID: `set`, `not set` or `incomplete`, and hints |
| `cli settings show <name> [--id <id>]`                         | The setting, a whole list or one entry as JSON, as the page reads it: keys only as hints       |
| `cli settings apply <name>`                                    | Saves the JSON body on stdin, as the page's **Save** does; for a list, adds an entry           |
| `cli settings apply <name> --id <id>`                          | Saves the body of the entry's edit form                                                        |
| `cli settings remove <name> --id <id>`                         | Deletes an entry, as the page's **Delete** does                                                |
| `cli settings test providers --id <id> --model <model>`        | The provider's **Test**: a short call to the model                                             |
| `cli settings test knowledge-sources --id <id> --query <text>` | The source's **Test**: a search                                                                |
| `cli settings test slack`                                      | **Check connection**                                                                           |
| `cli settings show providers --id <id> --models`               | The models the provider lists                                                                  |
| `cli settings show slack --channels`                           | The channels the bot can see, with their IDs                                                   |
| `cli settings show slack --manifest [--name <app name>]`       | The manifest for a new Slack app                                                               |
| `cli help`                                                     | The commands and the setting names                                                             |

The settings: `providers`, `knowledge-sources` and `agents` are lists;
`slack` and `app` (the **Settings** page) exist once.

- Secrets go only in the body on stdin, never in an argument (arguments show
  in `ps` and the shell history). Nothing prints a saved key or token.
- `apply` without `--id` adds an entry: it prints `Created. ID: …` on stderr
  and the new entry as JSON on stdout.
- For `providers`, `knowledge-sources` and `slack`, fields left out of the
  body stay as they are, as on the page; a key or token in the body
  replaces the saved one. `agents` and `app` take the whole body, as the page
  sends it: start from what `show` prints. An agent's body also needs the
  `version` that `show` printed; when the agent changed in between, the
  command refuses, as the page does.
- Exit codes: `0` done; `1` refused, with the page's message and the field
  on stderr (a failed test prints its result too); `2` a wrong command or a
  body that is not JSON.
- The support agent issues no tokens for other apps, so there is no
  `cli tokens`. Users stay on the **Users** page.

The bodies, as the pages send them:

`providers`, a new provider (`kind`: `anthropic`, `openai`, `mistral` or
`openai_compatible`; the last one needs a `baseUrl`, and its `apiKey` is
optional):

```json
{ "name": "Anthropic", "kind": "anthropic", "apiKey": "<API key>" }
```

`providers --id <id>`, a new key for a provider (or a new `name` or
`baseUrl`):

```json
{ "apiKey": "<API key>" }
```

`knowledge-sources`, a search API with a bearer token (`auth`: `none`,
`bearer` or `oauth2_client_credentials` with `tokenUrl`, `clientId` and
`scope`; `secret` is the token or the client secret). The fields of
`config` are described in [Knowledge sources](knowledge-sources.md).

```json
{
  "name": "IT handbook",
  "description": "Public IT articles",
  "kind": "search_api",
  "config": {
    "url": "https://search.example.org/search",
    "auth": "bearer",
    "tokenUrl": null,
    "clientId": null,
    "scope": null,
    "bodyTemplate": "{\"query\": \"{{query}}\", \"limit\": \"{{limit}}\"}",
    "resultsPath": "results",
    "titlePath": "title",
    "urlPath": "url",
    "textPath": "text",
    "sectionPath": null,
    "maxResults": 6
  },
  "secret": "<bearer token>"
}
```

`slack`: the bot token (`xoxb-…`), the app-level token (`xapp-…`) and the
optional alert channel, an ID from `cli settings show slack --channels`
(`null` turns the alerts off). Create the Slack app with the manifest of
`cli settings show slack --manifest` first ([Admin guide](admin-guide.md#1-connect-slack)).

```json
{ "botToken": "<bot token>", "appToken": "<app-level token>", "alertChannelId": "C0123456789" }
```

`agents`, a new agent: the provider's and the sources' IDs from
`cli settings list`, and Slack channel IDs. With `"enabled": true`, it
needs a provider, a model and a channel.

```json
{
  "name": "IT support",
  "enabled": true,
  "instructions": "You are the IT support assistant of our organization in this Slack channel.",
  "providerId": "<provider ID>",
  "model": "claude-sonnet-5-5",
  "fallbackProviderId": null,
  "fallbackModel": null,
  "replyMode": "questions",
  "followUpsInThreads": true,
  "noAnswerMode": "escalate",
  "escalationMessage": "I don't know. Please ask the IT team in #it.",
  "headlineThreads": false,
  "headlineMessage": "",
  "displayName": null,
  "iconUrl": null,
  "readImages": true,
  "channels": ["C0123456789"],
  "knowledgeSourceIds": ["<knowledge source ID>"]
}
```

To change an agent, start from what `show` prints: it keeps the `version`,
and `jq` turns the channels, which `show` prints with their names, back into
IDs:

```sh
docker compose run --rm -T migrate cli settings show agents --id <id> \
  | jq '.channels |= map(.id) | .enabled = false' \
  | docker compose run --rm -T migrate cli settings apply agents --id <id>
```

`app`, the **Settings** page (`retentionDays`: `0` keeps no texts;
`workingReaction`: an emoji name, or `null`):

```json
{
  "retentionDays": 90,
  "errorMessage": "Sorry, I can't answer right now. Someone from the team will get back to you.",
  "workingReaction": "eyes"
}
```

Then test it: `cli settings test slack`,
`cli settings test providers --id <id> --model claude-sonnet-5-5`, or
`cli settings test knowledge-sources --id <id> --query "reset my password"`.
Agent tests and the test console stay in the admin interface.

An AI with access to the server sets a key this way: it receives the secret
as a file, pipes the body into `cli settings apply`, runs
`cli settings test` and deletes the file. With `jq`, the secret never
appears in an argument:

```sh
jq -n --rawfile key anthropic-key '{name: "Anthropic", kind: "anthropic", apiKey: ($key | rtrimstr("\n"))}' \
  | docker compose run --rm -T migrate cli settings apply providers
docker compose run --rm -T migrate cli settings test providers --id <id> --model claude-sonnet-5-5
rm anthropic-key
```

## Sign-in

The admin interface signs people in through one OpenID Connect provider.
Register a client there with this redirect URL:

```
<APP_URL>/api/auth/callback/oidc
```

and set `OIDC_ISSUER`, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`. The
provider must return the email address (scopes `openid email profile`).

| Provider           | `OIDC_ISSUER`                                        | Notes                                                                                                                                                                                                                                                      |
| ------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keycloak           | `https://<host>/realms/<realm>`                      | Confidential client, standard flow.                                                                                                                                                                                                                        |
| Microsoft Entra ID | `https://login.microsoftonline.com/<tenant-id>/v2.0` | App registration, web platform, a client secret.                                                                                                                                                                                                           |
| Google             | `https://accounts.google.com`                        | OAuth client of type "Web application".                                                                                                                                                                                                                    |
| Slack              | `https://slack.com`                                  | The support agent's own Slack app works: its manifest already lists the redirect URL and the `openid email profile` user scopes. Use the app's Client ID and Client Secret (Basic Information). If sign-in fails at the token step, set `OIDC_PKCE=false`. |

Nobody can sign up. People sign in once an admin added their email address
(Users page), and the addresses in `ADMIN_EMAILS` are always active admins.
Keep at least one address there: it is the way back in when every admin
account is gone.

The support agent trusts the provider's email address: whoever signs in at
the provider with an address on the list gets that person's access. Use your
organization's own provider, where people cannot choose or change their
address themselves (no open self-registration). When the provider says an
address is not verified (`email_verified: false`), sign-in fails.

## Health checks

- `GET /-/livez`: the admin interface process runs.
- `GET /-/readyz`: it reaches the database.
- The bot touches `/tmp/bot-heartbeat` every 30 seconds while it is
  connected to Slack (or Slack is not set up yet); `compose.yaml` checks its
  age. The overview page of the admin interface shows the bot's state too.

When Slack stays unreachable for `BOT_WATCHDOG_SECONDS` (default five
minutes), the bot exits; `restart: unless-stopped` starts a fresh one. Keep a
restart policy on the bot container.

## Upgrades

An upgrade pulls a newer image. In `/srv/support-agent`:

1. Read the pull requests merged since the running commit (the overview page
   and **My settings → About** show it). A pull request labeled `breaking`
   says what to do; take those steps.
2. Run `git pull` for the newest `compose.yaml`, then
   `docker compose up -d --pull always`. With `SUPPORT_AGENT_IMAGE_TAG`
   pinned to `sha-<commit>`, set the new commit first.

The `migrate` service applies database migrations before `web` and `bot`
start. An upgrade can happen at any time, also while the bot answers: a
stop gives the answers in progress 45 seconds to finish, and the next start
takes up what is left, so no message is answered twice or lost
([Architecture](architecture.md#restarts-and-deploys)).

## Builds and deploys

Every commit on `main` that passes CI is built and, at ProjectTogether,
deployed. There are no numbered releases: the commit is the version.

- **CI** (`.github/workflows/ci.yaml`, on every pull request and on `main`):
  the history for secrets (Gitleaks), the files for private artifacts,
  internal names and credential formats (`scripts/check-public-repository.mjs`),
  lint, formatting, types, unit tests, migration drift, the build, the
  production dependencies' advisories (`scripts/audit.mjs`), the integration
  tests (PostgreSQL), and the image (started with `compose.yaml`).
- **Deploy** (`.github/workflows/deploy.yml`), when CI passes on `main`, or
  by hand (Actions → Deploy → Run workflow), for example after a setting
  changed:
  1. It builds `ghcr.io/projecttogether/support-agent` with `APP_VERSION`
     set to the first 12 characters of the commit and pushes it as
     `sha-<commit>` and `latest`.
  2. It sends the image and the app's settings to the server of the GitHub
     environment `production` over SSH. The server's deploy script pulls the
     image, writes the settings, runs the migrations, starts `web` and `bot`,
     waits until both are healthy, and puts the previous image and settings
     back when they do not become healthy. One deploy runs at a time; a
     newer one waits.

Without the variable `DEPLOY_HOST` in the environment `production`, step 2
deploys nothing. Label a pull request `breaking` when the people who run the
app must act on it, and write the steps into its description; merging
deploys it, so take steps that must come first before merging.

The package `support-agent` in GitHub's container registry must be public,
so that servers can pull it without a token: an owner of the organization
sets that once, after the first build.

### Settings

The settings come from two places:

- **Server settings**, written on the server by its own configuration
  (ProjectTogether's infrastructure repository): `APP_URL`, `DATABASE_URL`,
  `TZ`, `TRUST_PROXY`, `ENCRYPTION_KEY`, `AUTH_SECRET`, and
  `POSTGRES_PASSWORD` with `compose.postgres.yaml`. They win over the app
  settings.
- **App settings**, sent by the Deploy workflow at each deploy from the
  environment `production`: every other variable of
  [Configuration](configuration.md) that the app reads, as the workflow's
  `SETTINGS` list names them. Empty values are left out, so the app's
  default applies. A new setting needs a line in `SETTINGS` and its own line
  below it.

| Kind      | Names                                                                                                                                                                                                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secrets   | `DEPLOY_SSH_KEY`, `OIDC_CLIENT_SECRET`, `SENTRY_DSN`                                                                                                                                                                                                                                            |
| Variables | `DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS`, `APP_URL` (the environment's link only), `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_PROVIDER_NAME`, `OIDC_SCOPES`, `OIDC_PKCE`, `ADMIN_EMAILS`, `APP_NAME`, `BOT_WATCHDOG_SECONDS`, `BOT_CONCURRENCY`, `LOG_LEVEL`, `DATABASE_POOL_SIZE`, `SENTRY_ENVIRONMENT` |

The build reads one more secret, of the repository or the organization, not
of the environment: `SENTRY_AUTH_TOKEN` ([Error reports](#error-reports-sentry)).
Elsewhere, `compose.yaml` with a plain `.env` holds both kinds of settings
([Setup](#setup)).

### Rollbacks

A deploy that does not become healthy puts the previous image back by
itself. To go back by hand, revert the change on `main`, or run the server's
rollback. Neither undoes database migrations, so a migration keeps the
previous version working: add columns with a database default.

## Backups

Back up the PostgreSQL database (`pg_dump`, or the `postgres` volume) and
keep `ENCRYPTION_KEY` separately. Without the key the database still works,
but every stored API key and token must be entered again. A restore needs
the same `ENCRYPTION_KEY`; stop `web` and `bot` while restoring
(`docker compose stop web bot`).

## Error reports (Sentry)

With `SENTRY_DSN` set, the server and the admin interface send error reports
to Sentry (or a compatible service). The release is
`support-agent@<commit>` for the images of the Deploy workflow, unless
`SENTRY_RELEASE` is set. The Deploy workflow uploads the source maps to the
Sentry project `projecttogether/support-agent` when the secret
`SENTRY_AUTH_TOKEN` (an organization token) is set; without it, nothing is
uploaded. Reports carry no message texts, answers or keys.

## Logs

Both processes log JSON lines to standard output (`docker compose logs bot`).
Logs carry identifiers (agent, channel, error codes), never message texts or
keys. With `SENTRY_DSN`, errors also become error reports.

Useful lines from the bot: `connected to Slack`, `disconnected from Slack`,
`could not connect to Slack` (with the Slack error code),
`main model failed; trying the fallback model`, and `Slack unreachable for too
long; exiting so the process restarts`.

## Hardening

- Serve the admin interface over HTTPS only. It holds the API keys.
- Keep the admin interface reachable only where needed (for example on a
  VPN or behind the proxy's access rules); the bot does not need it.
- Give each knowledge source credentials that read only what its agents may
  answer from ([Knowledge sources](knowledge-sources.md)).
- Choose model providers your organization allows for the content of
  support questions: the question, the thread and the passages found go to
  the provider.
- Set the retention period of message texts in Settings (default 90 days).
