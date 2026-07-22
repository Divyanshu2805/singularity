# AI Chat / Code Generation

*Owner: `intelligence-service`.*

## `ChatController` (`/api/chat`)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/api/chat/stream` | `ChatRequest { message, projectId, teachingMode? }` | SSE stream of `{ text }` | `EDITOR`/`OWNER`. `teachingMode: true` asks for a `<learn>` walkthrough after each file written. 402 pre-flight before the stream opens if the daily token budget is spent. 409 if this user already has a response being generated for this project. Closing the connection only stops *watching* — the generation carries on. |
| GET | `/api/chat/projects/{projectId}` | — | `List<ChatResponse>` | Any role. Empty list, not an error, for a project with no chat session yet. |
| GET | `/api/chat/projects/{projectId}/last-turn-changes` | — | `LastTurnChangesResponse { files: [{ path, previousContent }] }` | Any role. What the latest saved turn changed, each file with its content from before the turn (`""` if the turn created it), so the editor can rebuild that turn's diffs on any page load. |
| GET | `/api/chat/projects/{projectId}/active` | — | `ActiveGenerationResponse { userMessage, startedAt, teachingMode, status }` or 204 | Any role. The caller's own response still being generated in this project (`status`: `RUNNING` while the model writes, `SAVING` once it is being stored); 204 if there isn't one. What a refreshed page needs to put the question back on screen. |
| GET | `/api/chat/projects/{projectId}/active/stream` | — | SSE stream of `{ text }`, or 204 | Any role. Re-attaches to that response: what has been written so far, then the rest live. 204 if it has already finished. |
| POST | `/api/chat/projects/{projectId}/active/stop` | — | 204 | `EDITOR`/`OWNER`. Stops the caller's own in-flight generation for that project, if one is running (`GenerationRegistry`). **A stopped generation is discarded**: nothing it wrote is saved and none of its tokens are billed. |

**Stream events (`POST /api/chat/stream`, and the re-attach stream):** the SSE payload is `StreamResponse { text }` JSON per event — raw model output as it streams, tagged with the `<message>`/`<todo>`/`<file>`/`<learn>`/`<tool>` protocol described in `docs/architecture/request-flows.md` §4.2. The client parses this incrementally (`use-stream-parser.ts`); the server separately persists the fully-parsed result as `ChatEvent` rows once the stream completes (see `docs/schema/`'s `CHAT_EVENT` entity). A failure after the stream has started can't become an HTTP status, so it arrives as an SSE event named `error` carrying a message — a specific "the AI provider is currently rate-limited" text once retries are exhausted, or a generic one.
