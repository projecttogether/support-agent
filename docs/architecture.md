# Architecture

An overview for contributors: the parts of the support agent, what happens to
a Slack message, and why it is built this way. The rules for writing code are
in [AGENTS.md](../AGENTS.md).

## Processes

One Docker image runs every process; `APP_ROLE` (the image's command) picks
the role:

| Role      | Runs                                                                            |
| --------- | ------------------------------------------------------------------------------- |
| `web`     | The admin interface: the React app, its API under `/api/v1`, sign-in.           |
| `bot`     | The Slack bot: one Socket Mode connection, the answering pipeline, maintenance. |
| `all`     | Both in one process (simplest setup, one container).                            |
| `migrate` | Applies the database migrations, then exits.                                    |

`compose.yaml` runs `web` and `bot` as separate containers, so the bot keeps
answering while the admin interface is down or being deployed.

The image's command `cli` runs the operator command (`src/cli.ts`, bundled
as `dist/cli.mjs`; `/usr/local/bin/cli` in the image): `cli settings`
lists, shows, applies, removes and tests what admins set in the admin
interface. The routes and the command call the same service functions (in
`modules/`); the command acts as the `operator` (`OperatorPrincipal`),
which only it creates, with an admin's rights. It reads bodies from stdin,
prints only its output on stdout and logs to stderr, starts no server or
bot, and reports nothing to Sentry.

PostgreSQL is the only stateful dependency: agents, providers, knowledge
sources, encrypted credentials, the conversation log, sessions and the bot's
status are tables.

```
 admin interface (web)                                   Slack
   React app · /api/v1 · /api/auth (OIDC)                  ▲ │ Socket Mode (outbound
        │ writes + NOTIFY                                  │ ▼  WebSocket, no public URL)
        ▼                                             ┌──────────────┐
   PostgreSQL ──── agents, providers, sources ──────▶ │  bot process │──▶ model providers
        ▲          (LISTEN, and every minute)         │              │──▶ knowledge search APIs
        └──── exchanges, heartbeat ◀──────────────────└──────────────┘
```

## A message, step by step

1. **Slack delivers the event** over the Socket Mode connection. The bot
   acknowledges it at once (Slack redelivers events not acknowledged within
   three seconds).
2. **Filter without a model** (`bot/handler.ts`): only channels with an
   enabled agent; no bots, edits or the bot's own messages; nothing older
   than 15 minutes (no late answers after downtime). Top-level messages
   count in reply mode "questions", or with a mention; thread replies count
   with a mention, or as follow-ups in threads the agent answered (if the
   agent allows it and the reply mentions nobody else), or under a headline
   (below) when the poster replies.
3. **Record the exchange** (outcome `pending`): one row per Slack message
   (unique on channel and message timestamp), so a redelivered event stops
   here. From now on the message survives a restart
   ([below](#restarts-and-deploys)). The answer waits in a queue;
   `BOT_CONCURRENCY` messages are answered at a time.
4. **Triage** (`agent/pipeline.ts`): one model call decides whether to answer
   and writes one to three search queries. Most chatter ends here, silently.
   A top-level message that only names a topic is a **headline** (if the
   agent waits for requests): the agent posts its headline message, if any,
   and treats the poster's replies in that thread as the request. Each such
   reply waits 30 seconds outside the queue (`Bot.later`), then goes ahead
   only if the poster wrote nothing newer (the newest reply answers for all,
   with the earlier ones as thread) and no colleague replied; otherwise its
   exchange is deleted.
5. **Search** every knowledge source with every query, in parallel; merge
   the passages by rank (at most 12) and give each a ref (`S1`, `S2`, …).
6. **Answer:** one model call with the passages, the thread and the
   question. It answers only from the passages and names the refs it used,
   or reports that they don't answer the question.
7. **Post** in the thread: the answer converted to Slack mrkdwn, plus links
   to the cited passages. The model never writes links of its own into that
   line. Links in the answer stay links only when their URL appears in the
   passages or the instructions; others keep just their text. Without an
   answer, the agent posts its escalation message or stays silent; under a
   headline, its headline message; on
   errors it posts the error message from the settings and alerts the alert
   channel. `agent/reply.ts` renders every reply.
8. **Update the exchange** with outcome, sources, model and tokens before
   posting (step 7), and with the reply's timestamp and the timing after it.

The test console and saved tests run steps 4 to 7 through the same code
(`runPipeline`, then `replyFor`), without Slack.

## Models

`llm/` has two adapters behind one interface (`LlmClient.chatJson`): the
Anthropic SDK for Anthropic, and OpenAI's chat completions for OpenAI,
Mistral AI and every OpenAI-compatible API. Both steps ask for a JSON object
with a hand-written schema (strict structured output); an API that rejects
structured output gets JSON mode, then a plain prompt. Replies are validated
with zod; an invalid reply gets one correction round. When the main model
fails or refuses, the agent's fallback model takes over for the rest of the
message.

## Configuration changes

The admin interface and the operator command write to the database and send
`NOTIFY support_agent_config` in the same transaction. The bot listens on that channel
and reloads within a second; it also reloads every minute. When a reload
fails (database unreachable), the bot keeps its last good configuration.
When the Slack tokens change, it reconnects.

## Staying up

- **Watchdog:** when Slack stays unreachable for `BOT_WATCHDOG_SECONDS`, the
  bot exits with an error; the container restart policy starts a fresh
  process. Rejected tokens don't trigger it (a restart would not help); the
  status page shows the problem instead.
- **Heartbeat:** every 30 seconds the bot writes its state to `bot_status`
  (shown on the admin interface's overview) and, while healthy, touches
  `BOT_HEARTBEAT_FILE` for the container health check.
- **Bounded waits:** model calls time out after 60 seconds with one retry,
  searches after 20 seconds, Slack calls after 20 seconds.
- **Visible failures:** errors become a reply ("can't answer right now"), an
  alert in the alert channel (once per agent and error per 15 minutes), an
  error-level log line (and an error report when `SENTRY_DSN` is set), and
  an exchange with outcome `error`.

## Restarts and deploys

Every deploy restarts the bot (`docker compose up` stops the old container,
then starts the new one). A Slack message is neither answered twice nor
lost across it:

- **Stop** (`Bot.stop`, on SIGTERM): the bot closes the Slack connection, so
  Slack sends it nothing more (Slack redelivers events it could not
  deliver), reports `disconnected`, and gives the answers in progress and in
  the queue 45 seconds to finish (`STOP_WAIT_MS`; `compose.yaml` gives the
  container a minute). Replies that wait under a headline are not run early.
- **What a stop leaves:** every message the agent took on has its exchange
  (step 3). Exchanges still `pending` are the ones a stop, a crash or the
  stop timeout cut short. Their outcome is stored before the reply is posted
  (step 8), so a pending exchange has no reply in Slack yet.
- **Start** (`resumeInterrupted`): once connected, and once no other bot
  process reported `connected` in the last minute, the bot takes up the
  pending exchanges that processes before it recorded in the last 15
  minutes (`findInterrupted`). It reads each message from Slack again and
  handles it as before: a reply under a headline waits again; a message
  that is gone is forgotten; when the bot already replied after the message
  (a version that posted before it stored the outcome), it is left alone.
- **Redelivered events** find their exchange and stop (step 3), also while
  the exchange is being resumed.

What is left: a process killed in the moment between storing the outcome
and Slack taking the reply loses that one reply; it is never posted twice.
Messages older than 15 minutes get no late answer (step 2).

## Data and privacy

- **Credentials** (API keys, Slack tokens, search secrets) are encrypted with
  AES-256-GCM and `ENCRYPTION_KEY`. The API never returns them; it shows the
  last four characters.
- **Message texts** (question, answer, reason, search queries) are removed
  after the retention period (`retentionDays`, default 90; 0 stores none).
  Outcome, sources, model, timings and tokens stay for a year.
- **Logs and error reports** carry identifiers, never message texts or keys.
- **Model providers** receive the question, the thread and the passages
  found. Choose providers your organization allows for that data.
- **Prompt injection:** retrieved passages and Slack messages are marked as
  data. They can still influence search queries and answers. The model
  cannot choose a search destination or run other tools. Limit each
  source to material its Slack audience may read.

## Sign-in and roles

Better Auth with one OpenID Connect provider; no passwords. Nobody can sign
up: people sign in once an admin added their email address, and addresses in
`ADMIN_EMAILS` are always active admins (first setup and recovery).
Admins manage everything; editors manage agents, tests and the
conversation log, but not providers, keys, Slack, users or settings.
