# Streaming

Long-running AI responses are delivered as server-sent events (SSE). Two endpoints families stream, and their payloads are **different formats** — a client must handle each on its own terms.

| Endpoints | Payload | Client parser |
|---|---|---|
| `POST /api/chat/stream`, `GET /api/chat/projects/{id}/active/stream` | JSON: `{ "text": "..." }` per event | `frontend/src/hooks/use-stream-parser.ts` |
| `POST /api/projects/{id}/code/explain/stream`, `.../code/ask/stream` | Plain text per event | `frontend/src/lib/sse.ts` |

## Chat stream

Each event's `data` is a `StreamResponse { text }` JSON object carrying raw model output as it is generated. The text uses the generation tag protocol (`<message>`, `<todo>`, `<file>`, `<delete>`, `<learn>`, `<tool>`), which the client parses incrementally to render messages, the build checklist and file edits as they arrive. When the stream completes, the server separately parses the full text into `ChatEvent` rows and publishes the file changes. See the [AI generation flow](../architecture/flows/ai-generation.md).

## Code-insight stream

Each event's `data` is plain text, not JSON. Two details matter:

- **Strip only the `data:` marker.** Spring writes no padding after the colon, so a leading space belongs to the model's output and must be kept.
- **Re-join multi-line events.** Spring splits a chunk containing newlines across several consecutive `data:` lines. Join them with `\n`; emitting them separately silently deletes every newline.

## Errors after the stream starts

Anything that fails *before* a stream opens (authorization, a spent quota, a concurrent generation) is an ordinary HTTP error response. A failure *after* the stream has started can't change the status code, so it arrives as an SSE event named `error` whose data is a human-readable message — a specific "the AI provider is currently rate-limited" message once retries are exhausted, or a generic one.

## Keep-alives

After about 20 seconds without output, both formats send a bare SSE comment line:

```
: keep-alive
```

It carries no `event:` or `data:` field, so a spec-compliant parser ignores it; clients should ignore any line that isn't `data:` or `event:`. It exists to keep bytes flowing through proxies with idle-connection timeouts (Cloudflare's, in production). The heartbeat (`SseHeartbeat`) subscribes to the underlying generation exactly once, so it never duplicates a billable AI call.

## Disconnecting

Closing a chat stream only stops *watching*. The generation keeps running and can be re-attached with `GET /api/chat/projects/{id}/active/stream`, or stopped with `POST /api/chat/projects/{id}/active/stop`. See [Chat](chat.md).
