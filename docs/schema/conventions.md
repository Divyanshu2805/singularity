# Design Conventions Worth Knowing

## Ownership lives on the join row, not a FK

`Project` has no `owner` column. Ownership is just `PROJECT_MEMBER.projectRole == OWNER` — the owner is not a special entity, just a row with a particular role value, created in the same transaction as the project itself (`ProjectServiceImpl.createProject`). This schema went back and forth twice during early development (a direct `Project.owner` FK, then back to the join-row model) before settling here; there's no FK to migrate if you're extending this.

## Soft delete is a plain column, not a framework filter

`User`, `Project`, and `ChatSession` carry a nullable `deletedAt`. There is **no** `@SQLDelete`/`@Where` annotation wired up — a soft-deleted row is not automatically excluded from any query. Every repository method that must exclude deleted rows does so explicitly (`WHERE p.deletedAt IS NULL` in the JPQL). If you add a new query against one of these three entities, you're responsible for that filter; nothing will add it for you, and nothing will warn you if you forget.

## Persisted enums and the `ddl-auto` trap

**This is the single most important thing to know before touching a persisted enum column.** Under `ddl-auto: update`, Hibernate generates a `CHECK (col IN (...))` constraint listing an `@Enumerated(STRING)` column's values *as they were when the column was first created* — and `update` never widens an existing constraint. Add a new enum constant, and every insert of that new value fails at runtime with no compile error and no startup warning; the symptom looks like an unrelated feature silently not working; `ChatEventType.TODO` hit exactly this the first time it was added.

Three ways this codebase avoids it, all found the hard way:

1. **A plain `String` column instead of `@Enumerated`** — `UsageEvent.feature`, `AuthAuditEventType`-typed `AUTH_AUDIT_EVENT.type` both do this. Confirmed to reliably avoid the constraint even on a *new* table (an `@Enumerated` field with an explicit `columnDefinition`, or even an `AttributeConverter`, still generated one — Hibernate sees the enum behind either).
2. **`chat_events.type`** avoids it via an explicit `columnDefinition = "varchar(255)"` — but this trick was found to **not** reliably prevent the constraint on a brand-new table (see point 1); it only worked here because the stale constraint was also dropped by hand from the existing dev database.
3. **`PreviewStatus`/`SubscriptionStatus`/`MessageRole`/`ProjectRole` remain plain `@Enumerated(STRING)`** with no special handling — meaning they're all still exposed to this trap the moment a new value is added to any of them. If you add one, drop and recreate the constraint on the dev database (`\d <table>` to check whether it exists first) in the same change, or convert the column to a plain `String` while you're at it.

There is no migration tool to catch this automatically — it's on you to remember.

## Composite keys

`ProjectMember` and `ChatSession` both use `@EmbeddedId` + `@MapsId`, backed by a small dedicated `@Embeddable, Serializable` ID class (`ProjectMemberId`, `ChatSessionId`) with `equals()`/`hashCode()` over both fields — required by the JPA spec for a composite key to behave correctly in the persistence context (entity identity, collection lookups, `@MapsId`).

## No checkpoint/rollback system

Unlike some AI app-builders, this platform does **not** version or snapshot generated file trees — a file write (`ChatEvent.FILE_EDIT`) simply overwrites the previous content in MinIO, and there is no way to view or restore an earlier version of a file once the AI has rewritten it. The closest things to "history" that do exist:

- The **chat transcript itself** (`ChatMessage`/`ChatEvent` rows) is permanent and un-deletable — it's the record of what was actually built, which is why editing a sent message refills the composer rather than rewriting history in place.
- A **diff against the turn's own baseline** — the client mirrors a file's pre-edit content to `sessionStorage` for the duration of that turn, so the "what changed" view works, but this is purely client-side, per-tab, and gone once the tab/session ends. There's no server-side equivalent.

Adding real versioning would be a meaningful schema change (something like a `FileVersion` table keyed by `ProjectFile` + a monotonic revision), not present today — see `TODO.md` if this is being considered.
