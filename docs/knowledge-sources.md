# Knowledge sources

Agents answer from knowledge sources: search APIs the bot calls over HTTP
with a question and that return passages with a title and a URL. A wiki, a
help center, a document store or a retrieval service can be a source, as
long as it offers (or gets) such an endpoint.

## The request

For every search the bot sends a `POST` to the source's URL with a JSON body
built from the source's **body template**. In the template, the string
`"{{query}}"` becomes the search query and `"{{limit}}"` the number of
results (as a number). The default template is the standard contract:

```json
{ "query": "{{query}}", "limit": "{{limit}}" }
```

which the bot sends as `{"query": "how do I reset my password", "limit": 6}`.
Add fixed filters as needed:

```json
{
  "query": "{{query}}",
  "filters": { "collection": "it-handbook", "limit": "{{limit}}" },
  "include_sources": true
}
```

The bot asks for up to three queries per question (in the question's
language, and in the knowledge base's language when the agent's
instructions name it), searches every source of the agent with each, and
gives the model at most 12 passages.

## Authentication

| Kind                         | What the bot sends                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| None                         | Nothing.                                                                                                                                                   |
| Bearer token                 | `Authorization: Bearer <secret>`.                                                                                                                          |
| OAuth 2.0 client credentials | Gets a token from the token URL with the client ID, the secret and the scope, caches it until shortly before it expires, and renews it once after a `401`. |

The secret is stored encrypted and never shown again.

**Access is decided by the source, not the bot.** Give each knowledge source
its own credentials with only the access its agents should have: an IT agent's
source reads the IT pages, an HR agent's source the HR handbook. Then even a
misleading prompt cannot make an agent quote what its source may not read.
Every page a source returns may end up in a Slack answer to anyone in the
agent's channels, including guests and people in Slack Connect channels.
The bot uses the source's credentials for every question. Check who can
read each channel before adding a source and when membership changes.

## The response

The bot reads at most 5 MB of a response (search or token URL); a longer
one fails the search.

The **response mapping** says where the bot finds the passages in the JSON
response, as dotted paths:

| Setting | Default   | Meaning                                                                                       |
| ------- | --------- | --------------------------------------------------------------------------------------------- |
| Results | `results` | The list of passages.                                                                         |
| Title   | `title`   | Title of the page, inside each passage.                                                       |
| URL     | `url`     | Link to the page. Only `http(s)` URLs are linked in answers.                                  |
| Text    | `text`    | The passage's text. Passages without text are skipped; long ones are cut at 4,000 characters. |
| Section | none      | Optional heading; a string or a list of strings (joined with ›).                              |

For the standard contract, the response is:

```json
{
  "results": [
    {
      "title": "Reset your password",
      "url": "https://it.example.org/password",
      "text": "Open the account portal and choose Reset password …"
    }
  ]
}
```

A response with nested fields, such as
`{"results": [{"text": "…", "source": {"title": "…", "url": "…"}, "heading_path": ["Accounts", "Passwords"]}]}`,
maps with Title `source.title`, URL `source.url` and Section `heading_path`.

## Testing a source

The knowledge source page has a test panel: enter a query and see the
passages exactly as the agents will. Errors name the problem without the
response body (for example "The search API answered 403" or "The response
has no list at "results"").

## Good passages

- Short passages (a few hundred words) on one topic work better than whole
  pages.
- Each passage needs the page's title and a URL people can open; the answer
  links to it.
- Keep outdated pages out of the index, or mark them in the text: the model
  only knows what the passage says.
