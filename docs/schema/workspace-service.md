# workspace-service data model

Projects, members, files, file revisions, live previews and published apps. Database: `singularity-workspace-db`.

`Project` has no `owner` field of its own — ownership is expressed entirely by a `PROJECT_MEMBER` row with `projectRole = OWNER`; see [Ownership lives on the join row](conventions.md#ownership-lives-on-the-join-row-not-a-foreign-key).

## PROJECT

A workspace being built.

| Field | Meaning |
|---|---|
| `name` | Not null. |
| `isPublic` | Whether the project is visible to non-members. Defaults `false`. Not currently enforced by any read endpoint — every project read still goes through `@security.canViewProject`. |
| `templateInitIssue` | Nullable. `null` = the starter template copied cleanly (or wasn't needed); otherwise a short description of what's still missing. Cleared by `POST /api/projects/{id}/retry-template-init`. |
| `forkedFromProjectId` | Nullable, a plain `Long` (not a relation) — set by `POST /api/projects/{id}/fork`. Plain so a fork keeps working after its source is deleted. |
| `deletedAt` | Soft-delete marker. An owner's delete sets this; anyone else's delete instead removes only their own `PROJECT_MEMBER` row and leaves the project untouched — see [Projects API](../api/projects.md). |
| `currentFileRevisionId` | Nullable, a plain `Long` (not a relation on purpose — see [File revisions](../architecture/file-revisions.md)) — the project's currently-published revision. `null` until the project's first revision. Only ever advanced by `ProjectRepository.casAdvanceCurrentRevision`'s single-statement compare-and-swap, never a plain entity save. |

## PROJECT_MEMBER

The only record of who can access a project and how — owners and collaborators are both just rows here.

| Field | Meaning |
|---|---|
| `projectId` + `userId` | Composite primary key (`ProjectMemberId`, `@Embeddable`, `Serializable`, with `equals()`/`hashCode()` over both fields — required by the JPA spec for a composite key to behave correctly in the persistence context). `projectId` is a real foreign key; `userId` is a plain id into account-service's database. |
| `projectRole` | `OWNER`, `EDITOR`, or `VIEWER` — see [roles and permissions](enums.md#roles-and-permissions). A project has exactly one `OWNER`, written when it is created or forked; `ProjectMemberServiceImpl` refuses to grant, change or remove it. |
| `invitedAt` / `acceptedAt` | A row exists only for someone who has accepted, so `acceptedAt` is always set: an invitation is a `PROJECT_INVITE` row until then. Rows written before invitations had to be accepted were marked accepted as of their invitation by `V7__project_invites`. |
| `pinnedAt` / `starredAt` | Independent, nullable, per-member sidebar preferences. Re-setting either keeps the original timestamp so a list ordered by it doesn't reshuffle. |

## PROJECT_INVITE

An invitation nobody has answered yet. It grants nothing: no permission query reads this table.

| Field | Meaning |
|---|---|
| `id` | Generated. What the owner names to withdraw an invitation. |
| `projectId` | The project, a real foreign key. Unique together with `email`. |
| `email` | The invited address, lower-cased. Keyed by address and not by user on purpose: the row is written the same way whether or not an account exists, so inviting never reveals which addresses are registered. |
| `projectRole` | The role on offer, `EDITOR` or `VIEWER`. |
| `invitedBy` | The owner who sent it — a plain id into account-service's database. |
| `invitedAt` | When it was sent, or last re-sent. |

Written by a native upsert (`ProjectInviteRepository.upsert`), so inviting an address twice changes the offer instead of failing. Deleted when it is accepted (which writes the `PROJECT_MEMBER` row), declined or withdrawn. Lookups by address exclude deleted projects.

## PROJECT_FILE

Metadata for one file; content lives in MinIO, not this row. There is no `createdBy`/`updatedBy`: nothing would read them.

| Field | Meaning |
|---|---|
| `project` | `@ManyToOne`, not null. |
| `path` | The file's path within the project (`src/App.tsx`). Every MinIO key for it is built through one place, `ProjectFilePath.objectKey(projectId, path)`. |
| `minioObjectKey` | Locates the content in object storage. |
| `size` / `type` | Set from the real uploaded content (or the template source's real size, at template-init time) — never guessed. |
| `contentHash` | Nullable — the live content's SHA-256 hash in the `project-blobs` bucket (see [File revisions](../architecture/file-revisions.md)). `null` for a file not touched since revisions were introduced; lazily adopted the first time it's next edited or deleted. |
| `currentRevisionId` | Nullable, a plain `Long` — the revision that last changed this path. `null` for the same reason `contentHash` can be. |

## PROJECT_FILE_REVISION

One attempted change set — the durable manifest `RevisionPublisherImpl.publish` records before touching the live layout. See [File revisions](../architecture/file-revisions.md) for the full design.

| Field | Meaning |
|---|---|
| `projectId` | Plain `Long`, not a relation — a revision chain is walked by id via a recursive query, not loaded as an object graph. |
| `parentRevisionId` | Nullable, a plain `Long` — the revision this one was published against. `null` only for a project's very first revision. The optimistic-concurrency base for `ProjectRepository.casAdvanceCurrentRevision`. |
| `status` | `STAGING` → `APPLIED` (landed), `FAILED` (rolled back — storage/DB error), or `CONFLICT` (rolled back — lost the CAS race). |
| `source` | `AI_GENERATION`, `MANUAL_EDIT` (supported, but nothing produces it yet), or `RESTORE`. |
| `createdByUserId` | Plain `Long`. |
| `failureDetail` | Nullable — set only on `FAILED`. |

## PROJECT_FILE_REVISION_ENTRY

One path's change within a revision — a delta entry against its parent, not a full-tree snapshot row. A snapshot at any revision is reconstructed by walking `parentRevisionId` back to the root and keeping each path's most recent entry (`ProjectFileRevisionRepository.reconstructSnapshot`, a native recursive CTE).

| Field | Meaning |
|---|---|
| `revisionId` | Plain `Long`, not a relation, for the same reason as `PROJECT_FILE_REVISION.projectId`. |
| `path` / `changeType` | `EDIT` or `DELETE`. |
| `contentHash` | The new content's hash in `project-blobs`. `null` for `DELETE`. |
| `previousContentHash` | The path's content hash immediately before this revision — the rollback data a failed or superseded publish restores from. `null` only if the path did not exist before this revision (a brand-new file). |
| `size` / `contentType` | `null` for `DELETE`. |

## PREVIEW

One attempt at running a project live (see the [live preview flow](../architecture/flows/live-preview.md)). A new row per start attempt, so a failure stays readable after a retry. Status only ever moves through `PreviewRepository`'s conditional status-transition updates (`markRunning`, `markFailed`, `markTerminated`, …) — never a plain entity save, since the async bootstrap and a user pressing Stop can race and a naive save from whichever finishes last could resurrect a stopped preview.

| Field | Meaning |
|---|---|
| `project` / `projectId` | The FK relation, plus a read-only mirror column (`insertable = false, updatable = false`) for code running outside a request — the reaper — where touching the lazy relation would throw. |
| `hostname` | The preview proxy's routing key (`p12-x7k2m9qd4a.localhost`). Reused across restarts of the same project (`findLatestHostname`) so a shared link keeps working, and randomly generated so it can't be guessed from the project id. |
| `startedByUserId` | Whose plan the preview allowance counts against. |
| `status` | `PreviewStatus` — see below. |
| `detail` | While `CREATING`: the step in progress. Once ended: why. |
| `podName` | The claimed runner pod. **Null while `CREATING` means the start is waiting in line** for a runner; the order of the line is the rows' ids. |
| `failureLog` | Tail of install/dev-server output on a failed start — the pod is gone by the time anyone reads this, so it has to be captured before that. |
| `failureKind` | `PreviewFailureKind` — what a failed start died of. Null on rows from before migration V5, for which the browser falls back to reading `detail`. |
| `syncedRevisionId` / `syncDetail` | The project file revision the runner's files were last brought up to, and the step under way while a newer one is being applied. A running preview is "Updating" while `syncedRevisionId` differs from `PROJECT.currentFileRevisionId` and "Up to date" when they match. Deliberately not a foreign key: it is compared, never joined. |
| `lastAccessedAt` | Refreshed by `PreviewLifecycle` while the app polls `GET .../preview`. Distinct from the proxy's own Redis-side "seen" tracking of direct browser visits. |
| `bootstrapOwner` / `bootstrapHeartbeatAt` | Written when a bootstrap claims a `CREATING` row and refreshed on every poll while it runs. On startup, `PreviewReaper` fails a `CREATING` row left over from before only if this heartbeat is missing or older than its own staleness grace period — not unconditionally — so a rolling deployment's new instance doesn't fail a bootstrap another, still-live instance owns. `bootstrapOwner` is a diagnostic label only; the fail/keep decision is judged by heartbeat age, not identity. |

## PREVIEW_SESSION

One person's use of a shared `PREVIEW` runner. A preview is one pod per project (a second runner would just be a stale copy of the same files); a session is what makes it *someone's* — it shows as running for a person only while their session is open, their Stop ends only their session, and their plan's preview allowance counts only their own open sessions. The runner itself is torn down only once its last session ends (`shutDownIfUnused`).

| Field | Meaning |
|---|---|
| `preview` | `@ManyToOne`, the shared runner. |
| `projectId` | Denormalised from `preview.project`, so "this user's session on this project" is a single-table lookup. |
| `lastSeenAt` | This person's own idle clock — separate from `Preview.lastAccessedAt`. |
| `endedAt` / `endReason` / `failed` | Null while open. `failed = true` means the runner never came up — shown to the user as an error rather than a normal stop. |

## PUBLISHED_APP

A project's published app (see the [publishing flow](../architecture/flows/publishing.md) and [ADR 0008](../architecture/decisions/0008-published-apps.md)). **One row per project that has ever been published**, so the link stays the project's across unpublish and publish again. Created by migration V6. Live and build are separate groups of columns on purpose: an update that fails leaves the live app exactly as it was. Every change to the build columns goes through `PublishedAppRepository`'s conditional updates, which name the build number and apply only while that build is still the one under way - so a build ended by Unpublish, a project's deletion or the sweeper cannot write its result over what replaced it.

| Field | Meaning |
|---|---|
| `project` / `projectId` | The FK relation (unique: one row per project), plus a read-only mirror column for code outside a request. |
| `slug` | The link's name - one DNS label, unique across the table, chosen once and kept. Reserved and preview-shaped names are refused (`PublishedSlug`). |
| `status` | `PublishStatus`: `LIVE` or `UNPUBLISHED` (the link kept, nothing served). |
| `livePrefix` / `liveRevisionId` / `liveFileCount` / `liveBytes` | The served build's storage prefix (`b<N>/`), the project revision it was made from (compared with `PROJECT.currentFileRevisionId` to say "you have changes that are not published"; null for a project with no revision yet), and its size. |
| `publishedByUserId` / `publishedAt` | Who started the live build, and when it went live. |
| `buildNumber` | Builds ever started for the row; names each build's storage prefix. Incremented by the claim. |
| `buildStatus` | `PublishBuildStatus`: `BUILDING`, `FAILED`, or null when no build is under way. |
| `buildRevisionId` / `buildDetail` | The revision being built and the step under way. |
| `buildPodName` | The runner pod the build holds. `PreviewReaper`'s orphan sweep counts it as owned. |
| `buildStartedByUserId` / `buildStartedAt` | Whose build, and when it started - the next claim must be at least `publishing.min-build-interval` later. |
| `buildHeartbeatAt` / `buildOwner` | Refreshed every few seconds while the build runs. `PublishSweeper` fails a `BUILDING` row whose heartbeat is older than `publishing.heartbeat-stale-after`. `buildOwner` is a diagnostic label. |
| `failureKind` / `failureDetail` / `failureLog` | `PublishFailureKind`, one plain sentence, and the tail of the output of a failed build. |
| `retiredPrefix` / `retiredAt` | A build that no longer serves and is waiting to be deleted. The sweeper deletes every build the app has in storage except the live one and the one under way, since the row can remember only one. |

The storage layout is not in the database: `published-apps/<slug>/current.json` is the pointer, `<slug>/b<N>/site/` the build and `<slug>/b<N>/src/` the sources it was made from.
