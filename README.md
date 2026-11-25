# Support Agent

ProjectTogether's open-source support agent for Slack. People ask questions
in a support channel; the agent searches your knowledge base and answers in
the thread, with links to the pages it used. When it doesn't know, it says
who to ask instead, or stays silent and lets a person answer.

Admins set everything up in a web interface: the model providers and their
API keys, where the knowledge comes from, and any number of agents, each
with its own instructions, Slack channels, model and knowledge. The same
settings can be set on the server with `cli settings`, without a browser.

```
#it-help ─── Slack (Socket Mode) ──▶ bot ──▶ 1. answer or stay silent?
                                         2. search the knowledge sources
                                         3. answer from what it found
                                         4. reply in the thread, with sources
admin interface ──▶ PostgreSQL ◀── bot reloads agents and settings on every change
```

## Features

- **Several agents**, each with instructions, Slack channels, reply behavior
  (answer questions without a mention, or only when mentioned) and its own
  knowledge sources.
- **Model providers:** Anthropic, OpenAI, Mistral AI, and any
  OpenAI-compatible API (Azure OpenAI, a self-hosted vLLM or Ollama). Each
  agent has a main model and an optional fallback model on another provider.
- **Knowledge sources** over HTTP: any search API that takes a query and
  returns passages with titles and URLs. Credentials live with the source, so
  the source decides what each agent may read
  ([Knowledge sources](docs/knowledge-sources.md)).
- **Grounded answers:** the agent answers only from the sources it found and
  links only to their URLs.
- **Screenshots:** agents can read images attached to questions.
- **Test console:** ask an agent a question in the admin interface, see what
  it searched, what it found and what it would post, also for unsaved
  changes. Saved test questions run again after every change.
- **Conversation log** with 👍/👎 feedback from Slack, and automatic removal
  of message texts after a retention period.
- **Built to stay up:** the bot runs as its own process and needs no public
  address. It keeps working when the admin interface is down, keeps the last
  good configuration when the database is unreachable, and exits for a
  restart when Slack stays unreachable. Errors go to an alert channel.
- **Deploys at any time:** a restart lets the answers in progress finish and
  takes up what it cut short, so no question is answered twice or lost.
- **Sign-in with OpenID Connect** (Keycloak, Microsoft Entra ID, Google, or
  "Sign in with Slack"); admins and editors.

## Documentation

- [Deployment](docs/deployment.md): run it on a Linux server (Debian,
  Ubuntu), settings from the command line, sign-in, upgrades, builds and
  deploys, backups.
- [Configuration](docs/configuration.md): every environment variable.
- [Admin guide](docs/admin-guide.md): connect Slack, add providers and
  knowledge sources, set up and test agents.
- [Knowledge sources](docs/knowledge-sources.md): the search API contract.
- [Architecture](docs/architecture.md): how it works inside.
- [Contributing](CONTRIBUTING.md): development setup and checks.

Hono server, React admin app, PostgreSQL, one Docker image.

## Quick start (development)

```sh
docker compose -f compose.dev.yaml up -d   # PostgreSQL 18 and a Keycloak for sign-in
cp .env.example .env.local
npm ci
npm run dev
```

Open http://localhost:5173 and sign in as `ada@example.org` (password
`support-agent-dev`). The bot stays idle until a Slack app is connected on
the **Slack** page.

## License

Copyright 2026 ProjectTogether gGmbH

Licensed under the [Apache License 2.0](LICENSE).
