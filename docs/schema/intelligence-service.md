# intelligence-service data model

Chat history, code notes, a person's tour and glossary of a project, and AI usage. Database: `singularity-intelligence-db`.

## CHAT_SESSION

One project × one user's build conversation. `projectId` + `userId` is the composite primary key (`ChatSessionId`); both are plain ids into other services' databases.

| Field | Meaning |
|---|---|
| `deletedAt` | Soft-delete marker — but note: there is no server-side delete path for a chat session at all today (`TurnRecorder` only ever inserts). |

## CHAT_MESSAGE

One turn of a chat session. Its `(project_id, user_id)` is a real composite foreign key into `chat_sessions` — both tables live in this one database.

| Field | Meaning |
|---|---|
| `content` | The user's message, for a `USER` row. **For an `ASSISTANT` row it is `null`, never the model's output**: the real content lives entirely in the message's `CHAT_EVENT` children. Rows written long ago hold the literal placeholder `"Assistant Message here..."` instead; nothing reads either. Anyone querying `chat_messages` directly needs to know this. |
| `role` | `MessageRole` — see below. |
| `tokensUsed` | Nullable — `null` if the provider didn't report usage for that exchange. |
| `teaching` | Not null, default `false`. `true` on an `ASSISTANT` row whose turn was asked for in teaching mode; only such a turn's file edits can have a lesson written. Always `false` on a `USER` row. |
| `overview` | Nullable text, `ASSISTANT` rows only: the big picture teaching mode wrote about the turn, stored the first time it is shown (`POST /code/overview/stream`) and returned unchanged afterwards. Plain headed text. Added in `V3__turn_overview.sql`. |
| `revisionId` | Nullable. On an `ASSISTANT` row whose files were saved, the workspace-service revision they were published as - a plain id, no foreign key, since the revision lives in another database. It is what the chat's Undo restores to just before. `null` on a turn that wrote nothing and on every turn saved before `V4__turn_revision.sql`. |
| `events` | `@OneToMany(cascade = ALL)`, ordered by `sequenceOrder` — the actual structured content of an assistant reply. |

## CHAT_EVENT

One step of an assistant's response.

| Field | Meaning |
|---|---|
| `chatMessage` | `@ManyToOne`, not null. |
| `type` | `ChatEventType` — see below. |
| `sequenceOrder` | Render/fetch order. `0` is the turn's `THOUGHT` event; the model's events follow from `1`, then any notes the server added. |
| `content` | Markdown for `MESSAGE` — the model's own, or a note the server added about how the turn ended; the file's full content for `FILE_EDIT`; the raw lesson body for `LEARN` (`<what>` and `<why>`; turns saved earlier hold a `<summary>` and `<part>`s instead, and both are read); the model's working-out for `THINKING`; "Worked for 39s" for `THOUGHT`. |
| `filePath` | Always set for `FILE_EDIT`/`FILE_DELETE`. For `TODO`, the file that step writes (when it has one). For `LEARN`, the file the lesson is about. Stored in its tidied form (no leading `./` or `/`, forward slashes), so a `TODO` and the `FILE_EDIT` that completes it carry the same string — that equality is what ticks the step. See the [AI generation flow](../architecture/flows/ai-generation.md). |
| `metadata` | Free text — **how the turn ended, for `THOUGHT`** (`SAVED`, `ANSWERED`, `INCOMPLETE`, `NOT_SAVED`, `EMPTY`, `FAILED`, `STOPPED` or `OUT_OF_BUDGET`; see [outcomes](../api/streaming.md#outcomes) — absent on turns saved before outcomes were recorded); the comma-joined paths that were read, for `TOOL_LOG`; the comma-joined concepts introduced, for `LEARN`; the suggested answers joined with `\|`, for `ASK`. |
| `previousContent` | For `FILE_EDIT`/`FILE_DELETE`: the file as it was just before this turn wrote it (`""` for a new file, `null` if it couldn't be read). What lets the editor show a turn's diff (`GET /api/chat/projects/{id}/last-turn-changes`), and what a teaching-mode lesson is written from: a lesson explains the difference between this and `content`. |
| `lesson` | For `FILE_EDIT` only, nullable: the lesson teaching mode wrote about what this step changed, stored the first time the step is opened (`POST /code/lesson/stream`) and returned unchanged afterwards. Plain headed text, not tags - see the [AI generation flow](../architecture/flows/ai-generation.md#teaching-mode). Not the same thing as a `LEARN` event, which is how older turns stored a lesson written during the build. |
| `task` | For `FILE_EDIT` only, nullable: the "try changing this" task set from this step's change, stored the first time one is asked for (`POST /code/task/stream`) and returned unchanged afterwards. Plain headed text: what to change, `### L12 · Where to look`, `### Done when`. Added in `V5__tour_glossary_task.sql`. |
| `task_done` | Not null, default `false`. Set to `true`, for good, when the check of the task (`POST /code/task-check/stream`) first reads `Done` on its first line; it can only be set on an event that has a task. |

## CODE_NOTE

One saved question+answer exchange from the code-notes feature (see the [code insight API](../api/code-insight.md)).

| Field | Meaning |
|---|---|
| `projectId` + `userId` | Plain ids. **Every repository query filters on both** — there is deliberately no find-by-project-alone method, since that query is exactly the shape of the leak this design fixed (two accounts sharing a project seeing each other's notes). |
| `answer` | Written only once the answer finished streaming — a reply that errored or was left half-read is never saved. |
| `selectionPath`/`selectionCode`/`selectionStartLine`/`selectionEndLine` | The quoted block, or all four `null` for a question about the project in general. |

One row is one whole exchange (question + answer), not one message — deleting a note removes the pair together, and there's no soft delete: these are personal notes, a delete is a delete.

## PROJECT_TOUR

One person's tour of one project, "how your app fits together" (`POST /code/tour/stream`, read back with `GET /code/tour`). `UNIQUE (project_id, user_id)`: one row per project and person, since a tour is written for the reader's own level and costs their allowance. `content` is plain headed text; `updated_at` is when it was last written. The tour is kept until its reader writes it again, which replaces it (a native `INSERT ... ON CONFLICT DO UPDATE`); a stream that fails keeps nothing, so a failed rewrite leaves the old tour. Plain ids for project and user, as in `code_notes`; added in `V5__tour_glossary_task.sql`.

## GLOSSARY_ENTRY

One word of a person's glossary for a project (`POST /code/glossary/stream`, listed with `GET /code/glossary`). `UNIQUE (project_id, user_id, term_key)`: `term` is the word as the person met it (at most 80 characters, one line, no markup) and `term_key` is its lower-cased form, which is what a later press or look-up matches. `definition` is the meaning, an everyday comparison and an example from the person's own code, written once and never replaced: keeping is a native `INSERT ... ON CONFLICT DO NOTHING`, so the text a person has read stays and two presses at the same moment leave one row. An answer saying the word is not a programming word is shown but not kept. At most 200 words per person per project (enforced in the service). Every query filters on project and user. Added in `V5__tour_glossary_task.sql`.

## USAGE_LOG / USAGE_EVENT

Usage is recorded **twice, on purpose, in one transaction** (`UsageServiceImpl.recordTokenUsage`):

- `USAGE_LOG` — one row per user per day (`UNIQUE (user_id, date)`), a running total of what finished calls cost - and only that. What the pre-flight quota check reads (`reserveBudget`) — a single-row lookup, so it has to stay cheap. What a call in progress is holding is not in this table; see [the daily allowance](../architecture/flows/ai-generation.md#the-daily-allowance). The allowance it is compared against comes from account-service.
- `USAGE_EVENT` — one row per AI call, the ledger behind the usage-insights page's breakdowns by feature/project/day. `feature` is a **plain `String` column** (`VARCHAR(32)`), deliberately not `@Enumerated`.

The two serve different reads and neither can stand in for the other: the counter can't say *where* tokens went, and the ledger is too expensive to check on every single AI request. Usage recorded before the ledger existed is reported as an `UNATTRIBUTED` bucket rather than guessed at, so a chart's total always matches what the quota counted.
