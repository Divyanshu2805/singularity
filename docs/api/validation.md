# Request Validation

Every request body is a record with Bean Validation constraints, bound with `@Valid`; a failure is a `400` whose `errors` array lists every invalid field. Response records never carry validation annotations.

Constraints worth knowing:

| DTO | Field | Constraint | Note |
|---|---|---|---|
| `CreateSessionRequest`, `ReportSecurityEventRequest` | `idToken` | `@NotBlank @Size(max = 8192)` | |
| `InviteMemberRequest` | `username` | `@NotBlank @Email` | The field is called `username` but holds the invitee's email address. |
| `ChatRequest` | `teachingMode` | none | A boxed `Boolean`, so a missing or `null` value simply means off. |
| `AskCodeRequest` | `path` | `@Size(max = 500)`; required only when `code` is present | The selection is optional as a pair, not per field (`@AssertTrue isSelectionComplete`). |
| `AskCodeRequest` | `history` | `@Size(max = 40)` | The server enforces its own ceiling regardless of what the client trims. |
| `CodeChatTurn` | `role` | `@NotBlank @Size(max = 20)`, **and** checked by value | Length alone wouldn't stop `role: "system"` from injecting instructions; anything other than `"assistant"` is treated as a user turn. See [AI prompt boundaries](../architecture/security-model.md#ai-prompt-boundaries). |
| `CreateProjectFromPromptRequest`, `ClarifyIdeaRequest`, `CompileIdeaRequest` | free-text fields | `@Size(max = 4000)` | Validation rejects an absurd payload; separately, only the first 1,500 characters are sent to the model. |
