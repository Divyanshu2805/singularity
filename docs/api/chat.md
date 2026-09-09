# Chat

AI chat and code generation. **Service:** intelligence-service · **Controller:** `ChatController` (`/api/chat`)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `POST` | `/api/chat/stream` | `ChatRequest { message, projectId, teachingMode? }` | SSE of `{ text }` | `EDITOR` or `OWNER`. `teachingMode: true` adds a `<learn>` walkthrough after each file written. `402` before the stream opens if the daily token budget is spent. `409` if this user already has a generation running for this project. |
| `GET` | `/api/chat/projects/{projectId}` | — | `List<ChatResponse>` | Any role. An empty list, not an error, for a project with no chat yet. |
| `GET` | `/api/chat/projects/{projectId}/last-turn-changes` | — | `LastTurnChangesResponse { files: [{ path, previousContent }] }` | Any role. What the latest saved turn changed, with each file's content from before the turn (`""` if the turn created it), so the editor can rebuild that turn's diffs on any page load. |
| `GET` | `/api/chat/projects/{projectId}/active` | — | `ActiveGenerationResponse { userMessage, startedAt, teachingMode, status }`, or `204` | Any role. The caller's own generation still in progress in this project. `status` is `RUNNING` while the model writes and `SAVING` while it is being stored. |
| `GET` | `/api/chat/projects/{projectId}/active/stream` | — | SSE of `{ text }`, or `204` | Any role. Re-attaches to that generation: everything written so far, then the rest live. `204` if it has already finished. |
| `POST` | `/api/chat/projects/{projectId}/active/stop` | — | `204` | `EDITOR` or `OWNER`. Stops the caller's own in-flight generation. **A stopped generation is discarded**: nothing it wrote is saved and none of its tokens are billed. |

## Behavior

- **Closing the connection doesn't stop the generation.** It only stops watching; re-attach or stop it with the endpoints above.
- **One generation per user per project** at a time.
- **All-or-nothing file changes.** A turn's file changes are published as a single revision when the stream completes. If publishing fails, none of the changes are applied and the turn is saved without them. See [File revisions](../architecture/file-revisions.md).

## Related

- [Streaming](streaming.md) — the SSE payload format, error events and keep-alives.
- [AI generation flow](../architecture/flows/ai-generation.md) — what happens between the request and the committed files.
- [`CHAT_MESSAGE` and `CHAT_EVENT`](../schema/intelligence-service.md) — how turns are stored.
