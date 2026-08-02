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
## No checkpoint/rollback system

Unlike some AI app-builders, this platform does **not** version or snapshot generated file trees — a file write (`ChatEvent.FILE_EDIT`) simply overwrites the previous content in MinIO, and there is no way to view or restore an earlier version of a file once the AI has rewritten it. The closest things to "history" that do exist:

- The **chat transcript itself** (`ChatMessage`/`ChatEvent` rows) is permanent and un-deletable — it's the record of what was actually built, which is why editing a sent message refills the composer rather than rewriting history in place.
- The **last turn's diff**: each `FILE_EDIT`/`FILE_DELETE` event stores the file's `previousContent`, so the editor can show what the *latest* turn changed. Only the previous version is kept, not a chain of them, and there is no way to restore it.
- A **client-side baseline** — the client also mirrors a file's pre-edit content to `sessionStorage` for the duration of a turn. That is purely per-tab and gone once the tab/session ends.

Adding real versioning would be a meaningful schema change (something like a `FileVersion` table keyed by `ProjectFile` + a monotonic revision), not present today — see `TODO.md` if this is being considered.
