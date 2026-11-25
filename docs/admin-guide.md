# Admin guide

How to set up and run agents in the admin interface. The overview page shows
the bot's state, the setup steps still open, the last 24 hours and recent
errors.

Providers, knowledge sources, Slack, agents and the settings can also be set
on the server, without a browser
([Settings from the command line](deployment.md#settings-from-the-command-line)).
The audit log shows those changes with the actor `operator` and the command.

## Roles

| Role   | Can                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------- |
| Admin  | Everything: Slack, providers and API keys, knowledge sources, agents, users, settings, the audit log. |
| Editor | Agents (instructions, channels, models, knowledge), the test console and tests, the conversation log. |

Add people on the **Users** page by email address; they sign in with the
organization's sign-in provider. Deactivating someone ends their sessions.

Editors can run searches on any configured knowledge source and read
conversations from all agents, including those in private Slack channels.
Give the editor role to people authorized to see that data.

## 1. Connect Slack

On the **Slack** page:

1. Enter the app's name and copy the manifest. In Slack, open
   [Create an app](https://api.slack.com/apps?new_app=1) → **From a
   manifest**, choose the workspace and paste it. The manifest turns on
   Socket Mode and requests the scopes and events the bot needs.
2. **Install to Workspace** and copy the **Bot User OAuth Token**
   (`xoxb-…`).
3. Under **Basic Information → App-Level Tokens**, create a token with the
   scope `connections:write` and copy it (`xapp-…`).
4. Paste both tokens, save, and **Check connection**.

Required scopes let the bot read channel messages and answer. Optional
scopes enable: reading screenshots (`files:read`), a name and icon per agent
(`chat:write.customize`), the 👀 reaction while it works
(`reactions:write`), and 👍/👎 feedback (`reactions:read`).

Invite the bot to every channel an agent watches: `/invite @<app name>`.
The bot only receives messages from channels it is a member of.

Optionally choose an **alert channel**: when an agent fails (a model or a
knowledge source is unreachable), the bot posts there, at most once per agent
and error every 15 minutes.

## 2. Add a model provider

On the **Providers** page, add Anthropic, OpenAI or Mistral AI with an API
key, or an **OpenAI-compatible API** with its base URL (Azure OpenAI, a
self-hosted vLLM or Ollama; the key is optional there). **Test** sends a tiny
request to a model you choose.

Keys are stored encrypted and never shown again; the page shows their last
four characters. A provider in use by an agent cannot be deleted.

## 3. Add a knowledge source

On the **Knowledge sources** page, add the search API the agents should use
and test it with a query. [Knowledge sources](knowledge-sources.md)
describes the request, authentication and response mapping.

## 4. Create an agent

On the **Agents** page:

- **Instructions:** what the agent helps with, what it leaves to people, its
  tone, and anything it should always say. They are part of every prompt.
  Name the language of the knowledge base if it differs from the questions
  ("The knowledge base is in German").
- **Model:** the provider and model, and optionally a **fallback** on another
  provider, used when the main model fails or refuses.
- **Channels:** the Slack channels the agent watches. A channel belongs to
  one agent.
- **Knowledge sources:** where the agent searches.
- **Replies:** answer questions without a mention, or only when mentioned.
  Thread replies always need a mention, unless "answer follow-ups in its
  threads" is on; then replies in threads the agent answered get an answer
  too, unless they mention someone else.
- **When nothing answers the question:** post the escalation message (for
  example "I couldn't find this. Please ask @it-team.") or stay silent.
- **Wait for the request after a headline:** when a message only names a
  topic ("Question about the VPN") and the request follows in its thread,
  the agent answers the poster's replies there. It waits 30 seconds after
  each reply, so a request in several messages gets one answer, and stays
  out once a colleague replies in the thread. Under the headline it posts a
  message; the default asks to write the whole request in one message next
  time. Change it, or empty it to post nothing. Replies still waiting are
  lost when the bot restarts.
- **Messages addressed to colleagues:** the agent stays silent on them,
  unless the instructions say otherwise (for example "In this channel, a
  mention of IT staff is a normal request.").
- **Name and icon in Slack**, and whether the agent reads attached images.

A new agent starts disabled. Enable it once the test console answers well.

## 5. Test

The **Test** tab of an agent has a console: ask a question (optionally with
earlier thread messages, as a mention, or with screenshots) and see whether
the agent would answer, what it searched for, which passages it found and
cited, and the message it would post. The console uses the form's current
values, so you can test changes before saving them.

Save good questions as **tests**: "should answer" (optionally citing a
given URL), "should stay silent" (thanks, chatter, requests for people), or
"should wait for the request" (headlines).
Run them after every change to the instructions or the knowledge.

## Conversation log

**Conversations** lists every message an agent considered: the outcome
(answered, silent, waits for the request, no answer, error), the reason, the cited sources, model,
time and tokens, 👍/👎 feedback from Slack, and a link to the message.
Messages the agent never considered (in "mentions" mode, or replies between
people) are not recorded.

Unanswered and 👎 questions show where the knowledge base needs a page.

## Settings

- **Retention:** days the texts of questions and answers are kept (default
  90). Afterwards only outcome, sources, model, timing and tokens remain. 0
  stores no texts at all.
- **Error message:** what agents post when they fail.
- **Working reaction:** the emoji added to a question while the agent works
  on it (empty for none).

Every change in the admin interface is listed in the **Audit log**, without
secrets.

## Version

The overview page and **My settings → About** show the version that runs:
the commit it was built from. New versions arrive with deploys
([Deployment](deployment.md#upgrades)); the bot answers on through a deploy.
