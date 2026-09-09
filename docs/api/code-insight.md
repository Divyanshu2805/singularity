# Code Insight

Explanations of selected code, questions about a project, and each user's saved notes. **Service:** intelligence-service · **Controller:** `CodeInsightController` (`/api/projects/{projectId}/code`)

These paths sit under `/api/projects/**` but are routed to intelligence-service, not workspace-service: the Gateway gives `/api/projects/*/code/**` a higher priority. Every endpoint requires project `VIEW`.

**Read-only by construction.** The model is given exactly one tool (`read_files`) and its prompts never mention the file-writing protocol, so nothing on this path can edit a project. See [AI prompt boundaries](../architecture/security-model.md#ai-prompt-boundaries).

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `POST` | `/code/explain` | `ExplainCodeRequest { path, code, startLine, endLine }` | `{ answer }` | One-shot explanation of a selected block. `402` if the daily token budget is spent. |
| `POST` | `/code/ask` | `AskCodeRequest { path?, code?, question, history }` | `{ answer }` | The selection is optional — omit it to ask about the project in general. The project's file paths (not contents) are always sent as context. `history` is replayed by the client (at most 40 turns); each turn's `role` is validated by value, and anything other than `"assistant"` is treated as a user message. Same budget check. |
| `POST` | `/code/explain/stream` | as `/code/explain` | SSE, plain text | The endpoint the UI uses. |
| `POST` | `/code/ask/stream` | as `/code/ask` | SSE, plain text | The endpoint the UI uses. |
| `GET` | `/code/notes` | — | `CodeNoteResponse[]` | The caller's own saved notes for this project, oldest first. |
| `POST` | `/code/notes` | `SaveCodeNoteRequest { question, answer, selection? }` | `CodeNoteResponse` | Saves one finished exchange. The client calls this after a stream finishes. |
| `DELETE` | `/code/notes/{noteId}` | — | `204` | Another member's note id is a `404`, not a `403` — the lookup is scoped to the caller, so it simply isn't found. |
| `DELETE` | `/code/notes` | — | `204` | Clears the caller's notes for this project. |

Notes are private: every query filters on both the project and the caller, so members of the same project never see each other's notes.

## Related

- [Streaming](streaming.md#code-insight-stream) — the plain-text SSE format, which differs from the chat stream.
- [`CODE_NOTE`](../schema/intelligence-service.md#code_note) — how notes are stored.
