# Request Validation

Every `@RequestBody` DTO carries Bean Validation constraints; response DTOs never do. A few worth knowing:

| DTO | Field | Constraint | Note |
|---|---|---|---|
| `SignupRequest`/`LoginRequest`/`InviteMemberRequest` | `username` | `@NotBlank @Email` | Field is called `username` but is still validated as email-shaped — a rename from `email` never touched the validation. |
| `LoginRequest` | `password` | `@Size(min = 8)` | **Undecided reversal, flagged in the code itself**: an account created before this constraint existed can no longer log in via the legacy path at all, since length is checked before any password comparison. Not yet resolved either way. |
| `ChatRequest` | `teachingMode` | none | Deliberately unconstrained — a missing/`null` value means off, boxed `Boolean` so absence isn't a deserialization error. |
| `AskCodeRequest` | `path` | `@Size(max = 500)`, required only when `code` is present (`@AssertTrue isSelectionComplete`) | Selection is optional as a pair, not per-field. |
| `CodeChatTurn.role` | — | `@NotBlank @Size(max = 20)` **and** checked by value in code | Length alone wouldn't stop a client sending `role: "system"` to smuggle instructions into the replayed history — see the `CodeInsightController` note above. |
| `AskCodeRequest.history` | — | `@Size(max = 40)` | Older turns are trimmed client-side before sending, but the server enforces its own ceiling regardless of what the client claims to trim. |
| `CreateProjectFromPromptRequest`/`ClarifyIdeaRequest`/`CompileIdeaRequest` | free-text fields | `@Size(max = 4000)` | Validation caps the payload; a separate, smaller truncation (`MAX_IDEA_CHARS = 1500`) trims what actually reaches the model — the two limits do different jobs (reject an absurd payload vs. don't waste prompt tokens on excess detail). |
