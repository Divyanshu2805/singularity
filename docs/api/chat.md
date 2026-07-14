# AI Chat / Code Generation

## `ChatController` (`/api/chat`)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/api/chat/stream` | `ChatRequest { message, projectId, teachingMode? }` | SSE stream of `{ text }` | `EDITOR`/`OWNER`. `teachingMode: true` asks for a `<learn>` walkthrough after each file written. 402 pre-flight before the stream opens if the daily token budget is spent. |
| GET | `/api/chat/projects/{projectId}` | — | `List<ChatResponse>` | Any role. Empty list, not an error, for a project with no chat session yet. |
| POST | `/api/chat/projects/{projectId}/active/stop` | — | 204 | Stops the caller's own in-flight generation for that project, if one is running (`GenerationRegistry`). |

**Stream events (`POST /api/chat/stream`):** the SSE payload is `StreamResponse { text }` JSON per event — raw model output as it streams, tagged with the `<message>`/`<todo>`/`<file>`/`<learn>`/`<tool>` protocol described in `docs/architecture/`. The client parses this incrementally (`use-stream-parser.ts`); the server separately persists the fully-parsed result as `ChatEvent` rows once the stream completes (see `docs/schema/`'s `CHAT_EVENT` entity). A mid-stream provider rate limit (after retries are exhausted) surfaces as a specific "the AI provider is currently rate-limited" text chunk rather than a generic failure — a stream that has already started can't become an HTTP error status.
