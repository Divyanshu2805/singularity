# Design Conventions Worth Knowing

## Ownership lives on the join row, not a FK

`Project` has no `owner` column. Ownership is just `PROJECT_MEMBER.projectRole == OWNER` — the owner is not a special entity, just a row with a particular role value, created in the same transaction as the project itself (`ProjectServiceImpl.createProject`). This schema went back and forth twice during early development (a direct `Project.owner` FK, then back to the join-row model) before settling here; there's no FK to migrate if you're extending this.

## Soft delete is a plain column, not a framework filter

`User`, `Project`, and `ChatSession` carry a nullable `deletedAt`. There is **no** `@SQLDelete`/`@Where` annotation wired up — a soft-deleted row is not automatically excluded from any query. Every repository method that must exclude deleted rows does so explicitly (`WHERE p.deletedAt IS NULL` in the JPQL). If you add a new query against one of these three entities, you're responsible for that filter; nothing will add it for you, and nothing will warn you if you forget. Soft deletes are also **local to the service that owns the row**: deleting a project in workspace does not touch the chat, notes or usage rows about it in intelligence.

## Enum columns carry no `CHECK` constraint — by design

Every enum-backed column (`project_role`, `status`, `role`, `type`, `feature`, …) is a plain `VARCHAR`, and none of the baseline migrations declare a `CHECK (col IN (...))`. That is deliberate. Under Hibernate's `ddl-auto: update`, the schema gets a `CHECK` listing an `@Enumerated(STRING)` column's values *as they were when the column was first created*, and `update` never widens it: adding a new enum constant then fails every insert of it at runtime, with no compile error and no startup warning (`ChatEventType.TODO` hit exactly this). The services' Flyway baselines carry no such constraint, and `validate` never generates one.

So adding an enum constant needs **no migration**. Don't add a hand-written `CHECK` "for safety" — it would recreate exactly the trap the baseline avoids, and this time Hibernate would not even be to blame.

## Composite keys

`ProjectMember` and `ChatSession` both use `@EmbeddedId` + `@MapsId`, backed by a small dedicated `@Embeddable, Serializable` ID class (`ProjectMemberId`, `ChatSessionId`) with `equals()`/`hashCode()` over both fields — required by the JPA spec for a composite key to behave correctly in the persistence context (entity identity, collection lookups, `@MapsId`).

## Changing the schema

Each service's schema lives in `src/main/resources/db/migration/`: a baseline `V1__init.sql` per service, written to match the entities exactly, plus account-service's `V2__drop_user_password.sql`, which removed the vestigial `users.password` column left over from the pre-Firebase local login. The rules:

1. **A schema change is a new migration** — `V2__short_description.sql` in that service — never an edit to `V1`, and never something Hibernate does for you. Flyway refuses to start against a database whose applied migrations don't match the files.
2. **The entity changes in the same commit.** With `ddl-auto: validate`, a service will not boot if an entity has a column or type the database doesn't — which is the check that catches an entity edited without its migration.
3. **Another service's data is never joined.** A new reference to a user or project is a plain id column (see above), not a foreign key.
4. Update this file in the same change.
## Revision manifests

CODE_REVIEW.md AI-05 / CODE_TODO.md GATE-02: every file write publishes through `RevisionPublisherImpl` as one atomic, immutable revision — replacing what used to be a direct MinIO overwrite with no history at all. The design, in order:

1. **Stage** — every changed path's new content is uploaded to a second, dedicated MinIO bucket (`project-blobs`, configured via `minio.blob-bucket`), keyed purely by `sha256(content)` hex (`blob/<hash>`) — content-addressed and immutable, never overwritten or deleted. The same bytes written twice, even across projects, land at the same key (free dedup). A failure here leaves the live `project-bucket` layout and every table untouched, since nothing yet references the new content.
2. **Manifest** — one short Postgres transaction inserts a `PROJECT_FILE_REVISION` row (`STAGING`) and one `PROJECT_FILE_REVISION_ENTRY` per changed path, carrying both the new hash and the path's previous hash (the rollback data).
3. **Apply** — each entry is server-side copied from its blob key onto the project's existing live path key (`{bucket}/{projectId}/{path}` — the layout every other reader, and the K8s preview syncer's `mc mirror`, already depends on; this migration does not touch it) or removed, for a delete. Any failure rolls back every entry already applied *in that same call* using its captured previous hash, and marks the revision `FAILED`.
4. **Publish** — a single-statement compare-and-swap, `ProjectRepository.casAdvanceCurrentRevision`, atomically advances `PROJECT.currentFileRevisionId` only if it still matches the revision this publish was staged against. Losing the race rolls back the same way and marks the revision `CONFLICT`.

**Restore is not a special code path** — `RevisionServiceImpl.restore` reconstructs a target revision's snapshot, diffs it against the project's current live state, and publishes that diff through the exact same mechanism (`source = RESTORE`), which is what makes "restore reproduces exact files" (GATE-02's accept condition) provable with the same fault-injection tests as any other write, and guarantees a restore always creates a new forward-only revision rather than rewriting history.

**A legacy file** (any `ProjectFile` row with `contentHash IS NULL` — everything that existed before this shipped) is lazily adopted the first time it's next touched: its current live bytes are read once, hashed, and staged into `project-blobs` as-is, becoming that write's `previousContentHash`. No bulk backfill migration runs — Flyway SQL cannot hash MinIO bytes, and a file never touched again simply never gains revision history.

**What this deliberately does not do yet**, so the scope stays honest:
- **No blob garbage collection.** Blobs are never deleted, so storage grows monotonically — correct today (it's what makes rollback and restore always possible), but a refcount/reaper is future work once real usage shows it's needed.
- **No crash recovery mid-apply.** The rollback above handles an in-request failure; a process crash between two apply steps would leave a revision stuck `STAGING` with no automatic reconciliation — a startup job in the shape of `PREVIEW.bootstrapHeartbeatAt`'s stale-row pattern is the natural future fix.
- **No frontend surface.** `ProjectRevisionController`'s list/preview/restore endpoints exist and are tested but unconsumed by `frontend/` — ADDITIONALS.md MID-03's checkpoint list and preview-before-restore screen are what will eventually call them.
