# Code Insight (Code Lens / Code Notes)

## `CodeInsightController` (`/api/projects/{projectId}/code`)

*Owner: `intelligence-service`* — which is why these paths sit under `/api/projects/**` yet are routed to it, not to workspace (the Gateway's `order` makes `/api/projects/*/code/**` win). Every endpoint needs project `VIEW`.

Read-only by construction: the model is handed exactly one tool (`read_files`, nothing that writes), and its prompts (`CodeInsightPrompts`, kept apart from the code-generation `PromptUtils`) never mention the file-writing protocol — there is no way for it to emit an edit here.

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/code/explain` | `ExplainCodeRequest { path, code, startLine, endLine }` | `{ answer }` | One-shot explanation of a selected block. Checks the daily token budget (402). |
| POST | `/code/ask` | `AskCodeRequest { path?, code?, question, history }` | `{ answer }` | Selection is optional — omit it to ask about the project generally; the project's file paths (no contents) are always sent as context. `history` (client-replayed, ≤ 40 turns) has each `role` validated by value, not trusted — anything but `"assistant"` becomes a user message, closing an instruction-injection path. Same budget check. |
| POST | `/code/explain/stream` | same as `/explain` | SSE, plain-text chunks | The endpoint the UI actually calls. |
| POST | `/code/ask/stream` | same as `/ask` | SSE, plain-text chunks | Same. |
| GET | `/code/notes` | — | `CodeNoteResponse[]` | The caller's own saved thread, oldest first. |
| POST | `/code/notes` | `SaveCodeNoteRequest { question, answer, selection? }` | `CodeNoteResponse` | Saves one finished exchange — called by the client after a stream finishes, never from the stream's own completion (which runs with no security context). |
| DELETE | `/code/notes/{noteId}` | — | 204 | Another member's note id is a **404, not a 403** — the lookup is `findByIdAndProjectIdAndUserId`, so it simply isn't found rather than confirming it exists. |
| DELETE | `/code/notes` | — | 204 | Clears the caller's whole thread for this project. |

**Stream format quirk:** unlike `/api/chat/stream`, this SSE payload is **plain text, not JSON** — a client must strip only the `data:` marker, not the space after it (Spring writes no padding; a leading space belongs to the model's own output). Consecutive `data:` lines belonging to one event must be re-joined with `\n` — Spring splits a multi-line chunk across several `data:` lines, and emitting them separately silently deletes every newline.
