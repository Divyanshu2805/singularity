# Conventions

Rules the schema follows, and how to change it safely.

## Ownership lives on the join row, not a foreign key

`Project` has no `owner` column. Ownership is a `PROJECT_MEMBER` row with `projectRole = OWNER`, created in the same transaction as the project (`ProjectServiceImpl.createProject`). The owner isn't a special entity — just a member with a particular role.

## Soft delete is a plain column, not a framework filter

`User`, `Project` and `ChatSession` have a nullable `deletedAt`. There is **no** `@SQLDelete` or `@Where` annotation, so a soft-deleted row is not excluded from any query automatically. Every repository method that must exclude deleted rows does so explicitly (`WHERE p.deletedAt IS NULL`). A new query against one of these entities must add the filter itself; nothing will warn you if it's missing.

Soft deletes are local to the owning service: deleting a project in workspace-service doesn't touch the chat, note or usage rows about it in intelligence-service.

## Composite keys

`ProjectMember` and `ChatSession` use `@EmbeddedId` with `@MapsId`, backed by a small `@Embeddable`, `Serializable` id class (`ProjectMemberId`, `ChatSessionId`) with `equals()` and `hashCode()` over both fields, as the JPA specification requires for composite keys.

## Enum columns carry no `CHECK` constraint

Every enum-backed column (`project_role`, `status`, `role`, `type`, `feature`, …) is a plain `VARCHAR`, and no migration declares a `CHECK (col IN (...))`. This is deliberate: Hibernate-generated `CHECK` constraints list only the values that existed when the column was created and are never widened, so a new enum value would fail every insert at runtime. See [ADR 0006](../architecture/decisions/0006-flyway-owned-schemas.md).

Adding an enum value therefore needs **no migration**. Don't add a hand-written `CHECK` constraint — it would recreate the same trap.

## Upserts need native SQL

`save()` on an entity with a manually assigned id (no `@GeneratedValue`) calls `merge()`, which silently updates or inserts and never fails on a duplicate. Where an insert must detect a conflict — claiming a webhook event, claiming a checkout intent — the repository uses a native `INSERT … ON CONFLICT … DO UPDATE … WHERE …` instead (`WebhookEventRepository.tryClaim`, `CheckoutIntentRepository.claimOrRefresh`).

## Changing the schema

Each service's migrations live in `src/main/resources/db/migration/`:

| Service | Migrations |
|---|---|
| account-service | `V1__init`, `V2__drop_user_password`, `V3__checkout_intents`, `V4__subscription_uniqueness`, `V5__webhook_events_and_event_ordering`, `V6__subscription_sync_and_grace_state` |
| workspace-service | `V1__init`, `V2__unique_project_file_path`, `V3__preview_bootstrap_heartbeat`, `V4__revision_manifests` |
| intelligence-service | `V1__init` |

The rules:

1. **A schema change is a new migration** — `V<n>__short_description.sql` in the owning service. Never edit an applied migration: Flyway checksums the whole file, comments included, and refuses to start on a mismatch.
2. **Change the entity in the same commit.** With `ddl-auto: validate`, a service won't boot if an entity and the schema disagree — the check that catches one without the other.
3. **Never join another service's data.** A new reference to a user or project is a plain id column.
4. **Update these docs** in the same change.

On Spring Boot 4, Flyway's auto-configuration lives in `spring-boot-starter-flyway`. With only `flyway-core` on the classpath, Flyway silently never runs and validation fails with "missing table".
