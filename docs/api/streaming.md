# Streaming

Long-running AI responses are delivered as server-sent events (SSE). Two endpoint families stream, and their payloads are **different formats** — a client must handle each on its own terms.

| Endpoints | Payload | Client reader |
|---|---|---|
| `POST /api/chat/stream`, `GET /api/chat/projects/{id}/active/stream` | JSON `{ "text": "..." }` per event, in five kinds told apart by the event name | `consumeChatStream` in `frontend/src/lib/api.ts`; the text itself is read by `frontend/src/lib/generation-protocol.ts` |
| `POST /api/projects/{id}/code/explain/stream`, `.../code/ask/stream`, `.../code/lesson/stream` | Plain text per event | `frontend/src/lib/sse.ts` |

## Chat stream

Every event's `data` is a `StreamResponse { text }` JSON object. The event name says what the text is:

| Event | `text` | What the client does |
|---|---|---|
| *(unnamed)* | The next piece of the answer | Append it to the text held so far |
| `status` | One line saying what the server is doing between pieces — `Reading 4 files`, `The reply stopped early - writing the 2 files still left`, `Saving your changes` | Show it; drop it when the next piece arrives |
| `replace` | The whole text of the answer as it now stands | Replace the text held so far. Sent when the server cut something out before carrying a reply on — a file that stopped half-way, a premature "all done" |
| `done` | How the turn ended (below) | Stop reading. **Sent only after the turn is saved**, so reloading the conversation on it finds the turn there |
| `error` | A message for the user | The turn could not be saved at all, and nothing was changed |

A stream normally ends with `done`. A failure of the model, a stop and an unfinished answer are all turns that *were* saved, so they end in `done` too, with the reason in the outcome and a message inside the saved turn. `error` is left for the one case where saving itself failed.

### Outcomes

| `done` text | Meaning | Files saved |
|---|---|---|
| `SAVED` | The turn wrote files and they were published as one revision | Yes |
| `ANSWERED` | The turn answered in words or asked a question; there was nothing to write | — |
| `INCOMPLETE` | The answer still ended short of its own plan after being carried on; what it did write was saved, with a note | Yes, the ones written |
| `NOT_SAVED` | The files could not be published (a failed or conflicting revision, or access to the project was lost mid-turn) | No |
| `EMPTY` | The model returned nothing usable, twice | No |
| `FAILED` | The provider failed, refused, went silent or was rate-limited past the retries — or the server restarted mid-turn | No |
| `STOPPED` | The user stopped it | No |
| `OUT_OF_BUDGET` | The daily AI allowance ran out while the turn was being written; it was ended there, with a note saying how far it got | Yes, the ones finished |

The same value is stored on the saved turn (the `metadata` of its first event, a `THOUGHT`), which is how a client knows the outcome after a reload.

### The text

The answer's text uses the generation tag protocol — `<approach>` (or `<think>`), `<message>`, `<todo>`, `<file>`, `<edit>`, `<delete>`, `<ask>` and the server-written `<tool>` (and `<learn>`, which the model is no longer asked for but which saved turns still hold) — which the client parses as it arrives to render the thought process, messages, and the build card with each step's files and lesson. That reading is a preview: on `done` the client reloads the saved turn and shows that instead. An `<edit>` in particular reaches the browser only as "this path was changed" - the server alone applies it, and the file it produced arrives with the saved turn as an ordinary `FILE_EDIT`. The grammar is defined once and implemented twice, on the server and in the browser, against one shared file of cases — see [ADR 0004](../architecture/decisions/0004-tag-based-generation-protocol.md).

`<tool args="a.tsx,b.tsx">Reading 2 files</tool>` is written into the text by the server whenever the model's read tool runs. The model is not asked to write it.

A turn can end in one to three `<ask options="A|B|C">question</ask>` tags: the model asking the user something it cannot sensibly decide for them. They are always the last thing in the text. Usually such a turn writes nothing (`ANSWERED`); it may instead have built the part that does not depend on the answer first, in which case those files are saved as usual (`SAVED`). The suggested answers are separated by `|`; the client shows them as buttons and sends the chosen one as the next message, and the user can always type an answer instead.

### A stream that ends without `done`

The connection can close or break while the turn carries on — closing a stream never stops a generation. A client that sees the stream end with no `done` should ask `GET /api/chat/projects/{id}/active`: if a generation is still running, reattach with `.../active/stream`; if not, reload the history, where the finished turn now is. The reattached stream replays the whole text so far as one piece, then the current status line, then continues live.

## Code-insight stream

Each event's `data` is plain text, not JSON. Two details matter:

- **Strip only the `data:` marker.** Spring writes no padding after the colon, so a leading space belongs to the model's output and must be kept.
- **Re-join multi-line events.** Spring splits a chunk containing newlines across several consecutive `data:` lines. Join them with `\n`; emitting them separately silently deletes every newline.

A failure after a code-insight stream has started arrives as an event named `error` whose data is a human-readable message — a specific "the AI provider is currently rate-limited" message once retries are exhausted, or a generic one.

## Errors before the stream starts

Anything that fails *before* a stream opens — authorization, a spent quota (`402`), a generation already running for the project (`409`) — is an ordinary HTTP error response with the usual [error body](errors.md), never an event.

## Keep-alives

After about 20 seconds without output, both formats send a bare SSE comment line:

```
: keep-alive
```

It carries no `event:` or `data:` field, so a spec-compliant parser ignores it; clients should ignore any line that isn't `data:` or `event:`. It exists to keep bytes flowing through proxies with idle-connection timeouts (Cloudflare's, in production). The heartbeat (`SseHeartbeat`) subscribes to the underlying generation exactly once, so it never duplicates a billable AI call.

## Disconnecting

Closing a chat stream only stops *watching*. The generation keeps running and can be re-attached with `GET /api/chat/projects/{id}/active/stream`, or stopped with `POST /api/chat/projects/{id}/active/stop`. See [Chat](chat.md).
