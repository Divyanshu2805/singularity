# Entity Reference

## USER

An account holder — owns/collaborates on projects, chats, holds a subscription.

| Field | Meaning |
|---|---|
| `id` | Primary key. |
| `username` | Login identifier, unique, not null. Despite the name it's validated as email-shaped at the DTO layer (`@Email`) — nothing on the entity itself constrains the format. |
| `password` | A BCrypt hash. `NOT NULL`, but never a real user-chosen password — Firebase holds the actual credential. Set to an unguessable random secret at account creation (`SessionServiceImpl.resolveAccount`) purely to satisfy the column constraint; nothing ever authenticates against it (the legacy username/password login path that used to set this to a real password was removed). |
| `name` | Display name. |
| `stripeCustomerId` | Unique, nullable. Set once the user's first Stripe Checkout completes; reused on every later checkout so Stripe never mints a duplicate customer. |
| `firebaseUid` | Unique, nullable. Set on Firebase sign-in, or by the one-off `FirebaseUserImportRunner` for pre-Firebase accounts. |
| `deletedAt` | Soft-delete marker (see [Soft delete](conventions.md#soft-delete-is-a-plain-column-not-a-framework-filter) below). |

`User implements UserDetails` (Spring Security) with `getAuthorities()` hardcoded to an empty list — every authenticated caller is equivalent from Spring Security's point of view; role is per-project (`ProjectMember.projectRole`), not a platform-wide concept.

## PROJECT

A workspace being built.

| Field | Meaning |
|---|---|
| `name` | Not null. |
| `isPublic` | Whether the project is visible to non-members. Defaults `false`. Not currently enforced by any read endpoint — every project read still goes through `@security.canViewProject`. |
| `templateInitIssue` | Nullable. `null` = the starter template copied cleanly (or wasn't needed); otherwise a short description of what's still missing. Cleared by `POST /api/projects/{id}/retry-template-init`. |
| `forkedFromProjectId` | Nullable, a plain `Long` (not a relation) — set by `POST /api/projects/{id}/fork`. Plain so a fork keeps working after its source is deleted. |
| `deletedAt` | Soft-delete marker. An owner's delete sets this; an editor's delete instead removes only their own `PROJECT_MEMBER` row and leaves the project untouched — see `docs/api/`'s `ProjectController` section. |

## PROJECT_MEMBER

The only record of who can access a project and how — owners and collaborators are both just rows here.

| Field | Meaning |
|---|---|
| `projectId` + `userId` | Composite primary key (`ProjectMemberId`, `@Embeddable`, `Serializable`, with `equals()`/`hashCode()` over both fields — required by the JPA spec for a composite key to behave correctly in the persistence context). |
| `projectRole` | `OWNER`, `EDITOR`, or `VIEWER` — see [Domain Vocabulary](enums.md#domain-vocabulary-enums) below. Nothing enforces "exactly one `OWNER`" or restricts who may be assigned it (see `TODO.md`). |
| `invitedAt` / `acceptedAt` | `acceptedAt` is `null` until `POST /api/projects/{projectId}/members/accept`; access is **not** gated on it — an invited member has full access from the moment the row is created, whether or not they've accepted. This is a deliberate product choice, not an oversight. |
| `pinnedAt` / `starredAt` | Independent, nullable, per-member sidebar preferences. Re-setting either keeps the original timestamp so a list ordered by it doesn't reshuffle. |

## PROJECT_FILE

Metadata for one file; content lives in MinIO, not this row.

| Field | Meaning |
|---|---|
| `project` | `@ManyToOne`, not null. |
| `path` | The file's path within the project (`src/App.tsx`). Every MinIO key for it is built through one place, `ProjectFileServiceImpl.objectKey(projectId, path)` — see `docs/architecture/`'s file-storage notes. |
| `minioObjectKey` | Locates the content in object storage. |
| `size` / `type` | Set from the real uploaded content (or the template source's real size, at template-init time) — never guessed. |
| `createdBy` / `updatedBy` | `@ManyToOne User`, nullable. |

## PREVIEW

One attempt at running a project live (see `docs/architecture/`'s live-preview request flow for the full pipeline). A new row per start attempt, so a failure stays readable after a retry. Status only ever moves through `PreviewRepository`'s conditional status-transition updates (`markRunning`, `markFailed`, `markTerminated`, …) — never a plain entity save, since the async bootstrap and a user pressing Stop can race and a naive save from whichever finishes last could resurrect a stopped preview.

| Field | Meaning |
|---|---|
| `project` / `projectId` | The FK relation, plus a read-only mirror column (`insertable = false, updatable = false`) for code running outside a request — the reaper — where touching the lazy relation would throw. |
| `hostname` | The preview proxy's routing key (`p12-x7k2m9qd4a.localhost`). Reused across restarts of the same project (`findLatestHostname`) so a shared link keeps working, and randomly generated so it can't be guessed from the project id. |
| `startedByUserId` | Whose plan the preview allowance counts against. |
| `status` | `PreviewStatus` — see below. |
| `detail` | While `CREATING`: the step in progress. Once ended: why. |
| `failureLog` | Tail of install/dev-server output on a failed start — the pod is gone by the time anyone reads this, so it has to be captured before that. |
| `lastAccessedAt` | Refreshed by `PreviewLifecycle` while the app polls `GET .../preview`. Distinct from the proxy's own Redis-side "seen" tracking of direct browser visits. |

## PREVIEW_SESSION

One person's use of a shared `PREVIEW` runner. A preview is one pod per project (a second runner would just be a stale copy of the same files); a session is what makes it *someone's* — it shows as running for a person only while their session is open, their Stop ends only their session, and their plan's preview allowance counts only their own open sessions. The runner itself is torn down only once its last session ends (`shutDownIfUnused`).

| Field | Meaning |
|---|---|
| `preview` | `@ManyToOne`, the shared runner. |
| `projectId` | Denormalised from `preview.project`, so "this user's session on this project" is a single-table lookup. |
| `lastSeenAt` | This person's own idle clock — separate from `Preview.lastAccessedAt`. |
| `endedAt` / `endReason` / `failed` | Null while open. `failed = true` means the runner never came up — shown to the user as an error rather than a normal stop. |

## CHAT_SESSION

One project × one user's build conversation.

| Field | Meaning |
|---|---|
| `projectId` + `userId` | Composite primary key (`ChatSessionId`). |
| `deletedAt` | Soft-delete marker — but note: there is no server-side delete path for a chat session at all today (`finalizeChats` only ever inserts). |

## CHAT_MESSAGE

One turn of a chat session.

| Field | Meaning |
|---|---|
| `content` | **For an `ASSISTANT` row this is always the literal placeholder `"Assistant Message here..."`, never the model's real output.** The real content lives entirely in the message's `CHAT_EVENT` children — this column exists to satisfy the `not null` constraint and nothing reads it for an assistant turn. Anyone querying `chat_messages` directly needs to know this. |
| `role` | `MessageRole` — see below. |
| `tokensUsed` | Nullable — `null` if the provider didn't report usage for that exchange. |
| `events` | `@OneToMany(cascade = ALL)`, ordered by `sequenceOrder` — the actual structured content of an assistant reply. |

## CHAT_EVENT

One step of an assistant's response.

| Field | Meaning |
|---|---|
| `chatMessage` | `@ManyToOne`, not null. |
| `type` | `ChatEventType` — see below. |
| `sequenceOrder` | Render/fetch order. |
| `content` | Markdown for `MESSAGE`; the file's full content for `FILE_EDIT`; the raw walkthrough body for `LEARN`. |
| `filePath` | Always set for `FILE_EDIT`. For `TODO`, the file that step writes (when it has one). For `LEARN`, the file the walkthrough explains. **This string must match byte-for-byte between a `TODO` and its `FILE_EDIT`** — see `docs/architecture/`'s AI-generation flow for why. |
| `metadata` | Free text — the tool-args string for `TOOL_LOG`; the comma-joined concepts introduced, for `LEARN`. |

## CODE_NOTE

One saved question+answer exchange from the code-notes feature (`docs/api/`'s `CodeInsightController` section).

| Field | Meaning |
|---|---|
| `project` + `user` | Both `@ManyToOne`, not null. **Every repository query filters on both** — there is deliberately no find-by-project-alone method, since that query is exactly the shape of the leak this design fixed (two accounts sharing a project seeing each other's notes). |
| `answer` | Written only once the answer finished streaming — a reply that errored or was left half-read is never saved. |
| `selectionPath`/`selectionCode`/`selectionStartLine`/`selectionEndLine` | The quoted block, or all four `null` for a question about the project in general. |

One row is one whole exchange (question + answer), not one message — deleting a note removes the pair together, and there's no soft delete: these are personal notes, a delete is a delete.

## SUBSCRIPTION / PLAN

A user's billing relationship to a `PLAN` (billing tier). `Plan` is seeded on every boot by `config.PlanSeeder`, upserted on `stripePriceId` (Free, which has none, on `name`). Free's limits come from `SubscriptionService.FREE_TIER_PROJECTS_ALLOWED`/`FREE_TIER_DAILY_TOKENS`/`FREE_TIER_PREVIEWS` — the same Java constants that gate a user with no subscription at all, so the seeded row and enforcement can never disagree. `unlimitedAi` exists on the entity but is enforced nowhere — `maxTokensPerDay` is the real limit on every plan, including ones that could set it `true`.

## USAGE_LOG / USAGE_EVENT

Usage is recorded **twice, on purpose, in one transaction** (`UsageServiceImpl.recordTokenUsage`):

- `USAGE_LOG` — one row per user per calendar day, a running total. What the pre-flight quota check reads (`assertWithinDailyTokenBudget`) — a single-row lookup, so it has to stay cheap.
- `USAGE_EVENT` — one row per AI call, the ledger behind the usage-insights page's breakdowns by feature/project/day. `feature` is a **plain `String` column**, deliberately not `@Enumerated` — see [Persisted enums](conventions.md#persisted-enums-and-the-ddl-auto-trap) below.

The two serve different reads and neither can stand in for the other: the counter can't say *where* tokens went, and the ledger is too expensive to check on every single AI request. `config.UsageLedgerBackfill` ran once, only while `usage_events` was empty, reconstructing `BUILD` events from `chat_messages` history so the insights page has data predating the ledger.

## AUTH_AUDIT_EVENT / REVOKED_SESSION

Two small tables backing the Firebase-session auth model (`docs/architecture/`'s auth flow has the full picture):

- **`AUTH_AUDIT_EVENT`** — append-only sign-in history (`AuthAuditEventType`: `SIGN_IN`, `SIGN_IN_REJECTED`, `MFA_ENROLLED`, etc.). `userId` is a plain nullable column, not a relation — a rejected sign-in often has no matched user yet.
- **`REVOKED_SESSION`** — a session cookie that's been signed out of but hasn't naturally expired. Firebase can only revoke *every* session for a user at once; single-device sign-out is enforced here. Only the cookie's SHA-256 is stored, keyed as the primary key itself.

`PASSWORD_RESET_TOKEN` (legacy-flow-only — Firebase sends its own reset emails) was removed along with the rest of the legacy username/password auth path. No entity maps to it anymore, but — since this project has no migration tool and `ddl-auto` never drops anything on its own — the underlying `password_reset_tokens` table is still physically present in any database that had it; drop it by hand (`DROP TABLE password_reset_tokens;`) whenever convenient, it's orphaned and safe to remove.
