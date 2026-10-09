# Chat

AI chat and code generation. **Service:** intelligence-service · **Controller:** `ChatController` (`/api/chat`)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `POST` | `/api/chat/stream` | `ChatRequest { message, projectId, teaching? }` (`message` at most 16,000 characters; `teaching: true` marks the turn as built in teaching mode, which changes nothing about the build and lets its steps be opened for a [lesson](code-insight.md) afterwards) | SSE — see [the chat stream](streaming.md#chat-stream) | `EDITOR` or `OWNER`. `402` before the stream opens if the daily token budget is spent. `409` if a generation is already running for this project — anyone's, not only the caller's. |
| `GET` | `/api/chat/projects/{projectId}` | — | `List<ChatResponse>` | Any role. An empty list, not an error, for a project with no chat yet. Every turn is here however it ended, with its outcome on its first event. An assistant turn whose files were saved carries `revisionId`, the revision they were published as (`null` otherwise, and on turns saved before it was recorded) - hand it to [restore with `before=true`](revisions.md) to undo that turn. An assistant turn carries `teaching` (whether it was asked for in teaching mode) and `overview` once its big picture has been written, and a `FILE_EDIT` event carries `lesson` once one has been written for it, `task` once a "try changing this" task has been set from it, and `taskDone` (`false` until the check of that task has found the change made). |
| `DELETE` | `/api/chat/projects/{projectId}` | — | `204` | Any role. Deletes the caller's own conversation in this project - its turns and their events - and nothing else: the files, their revisions and other members' chats are untouched. `409` while the caller has a response in progress. |
| `GET` | `/api/chat/projects/{projectId}/last-turn-changes` | — | `LastTurnChangesResponse { files: [{ path, previousContent }] }` | Any role. What the latest saved turn changed, with each file's content from before the turn (`""` if the turn created it), so the editor can rebuild that turn's diffs on any page load. |
| `GET` | `/api/chat/projects/{projectId}/active` | — | `ActiveGenerationResponse { userMessage, startedAt, status }`, or `204` | Any role. The caller's own generation still in progress in this project. `status` is `RUNNING` while the model writes and `SAVING` while the turn is being stored. |
| `GET` | `/api/chat/projects/{projectId}/active/stream` | — | SSE, or `204` | Any role. Re-attaches to that generation: everything written so far as one piece, the current status line, then the rest live, ending in `done`. `204` if it has already finished — the turn is then in the history. |
| `POST` | `/api/chat/projects/{projectId}/active/stop` | — | `204` | `EDITOR` or `OWNER`. Stops the generation running on the project, **whoever started it**, and waits up to 10 seconds for it to be recorded, so the history can be reloaded straight away. A project runs one generation at a time for all its members, so the person refused with `409` has to be able to end the one in the way. The stopped turn is recorded in its owner's conversation; the caller is shown nothing of it. A generation that has begun saving is past stopping and finishes. |
| `POST` | `/api/chat/projects/{projectId}/suggestions` | — | `SuggestionsResponse { suggestions: string[] }` | Not called by the frontend any more. `EDITOR` or `OWNER`. Up to three short build requests that follow on from the caller's own last turn, each ready to send as it stands. An empty list - never an error - when that turn changed no files, there is no conversation, the daily allowance is spent or the provider failed. It is a small model call, charged to the caller as `SUGGEST`; the model is given what was asked, what was said and file paths, never a file's content. Not stored. |

## Behavior

- **Closing the connection doesn't stop the generation.** It only stops watching; re-attach or stop it with the endpoints above.
- **One generation per project at a time**, whoever started it: two responses rewriting the same files would each save over the other.
- **All-or-nothing file changes.** A turn's file changes are published as a single revision when the turn ends. If publishing fails, none of the changes are applied and the turn is saved without them, as `NOT_SAVED`. See [File revisions](../architecture/file-revisions.md).
- **Every turn is saved, however it ends.** A turn that failed, came back empty or was stopped is stored with what it had said and a message saying nothing was changed — never with its files. [Outcomes](streaming.md#outcomes) lists the endings.
- **A stopped turn saves none of its files**, including ones that had finished arriving. The text the model had produced by then is still metered: the provider reports no usage for a call cut short, so an estimate from the length of what it wrote is charged against the daily budget.
- **A turn stops when the daily allowance runs out.** Its spend is watched as it is written; at the limit the call is ended, the files it had finished are saved, and the turn ends `OUT_OF_BUDGET` with a note. It is never refused part-way with nothing to show, and never runs past the limit.
- **A turn always ends.** Each call to the model is abandoned after 3 minutes of silence or 10 minutes in all, and a whole turn after 20 minutes (`generation.*` in intelligence-service's `application.yaml`). A turn that runs out of time keeps what it finished: it is saved as `INCOMPLETE` if it had written some of its planned files, and as `FAILED` if it had written none.
- **A restart ends turns in progress.** On an orderly shutdown each running turn is stopped and saved as `FAILED` with a note that the server restarted. See [the AI generation flow](../architecture/flows/ai-generation.md#when-the-service-restarts).

## Related

- [Streaming](streaming.md) — the SSE events, outcomes and keep-alives.
- [AI generation flow](../architecture/flows/ai-generation.md) — what happens between the request and the committed files.
- [`CHAT_MESSAGE` and `CHAT_EVENT`](../schema/intelligence-service.md) — how turns are stored.
