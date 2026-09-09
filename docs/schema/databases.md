# Databases

All three databases live on one PostgreSQL server — the `pgvector-vibecraft` container (host port 9010) locally, and the `postgres` StatefulSet in production. `infra/postgres-init/` creates them on a brand-new volume. Connection settings are in each service's `application.yaml`.

| Service | Database | Tables | Entities |
|---|---|---|---|
| account-service | `vibecraft-account-db` | `users`, `plans`, `subscriptions`, `checkout_intents`, `webhook_events`, `auth_audit_events`, `revoked_sessions` | `User`, `Plan`, `Subscription`, `CheckoutIntent`, `WebhookEvent`, `AuthAuditEvent`, `RevokedSession` |
| workspace-service | `vibecraft-workspace-db` | `projects`, `project_members`, `project_files`, `project_file_revisions`, `project_file_revision_entries`, `previews`, `preview_sessions` | `Project`, `ProjectMember` (+ `ProjectMemberId`), `ProjectFile`, `ProjectFileRevision`, `ProjectFileRevisionEntry`, `Preview`, `PreviewSession` |
| intelligence-service | `vibecraft-intelligence-db` | `chat_sessions`, `chat_messages`, `chat_events`, `code_notes`, `usage_events`, `usage_logs` | `ChatSession` (+ `ChatSessionId`), `ChatMessage`, `ChatEvent`, `CodeNote`, `UsageEvent`, `UsageLog` |

That is 20 entity types plus two `@Embeddable` composite-key classes (`ProjectMemberId`, `ChatSessionId`).

## Identifiers

Every entity has a `Long id` (`BIGSERIAL`) unless it uses a composite key or a natural key:

- `ProjectMember` and `ChatSession` use composite keys (see [conventions](conventions.md#composite-keys));
- `CheckoutIntent` is keyed by its user id, `WebhookEvent` by Stripe's event id, and `RevokedSession` by the cookie hash.

## Timestamps

`createdAt` and `updatedAt` are maintained by Hibernate's `@CreationTimestamp` and `@UpdateTimestamp`. Timestamps are `timestamp without time zone` holding UTC wall-clock time.

The one exception is the *day* an AI-usage counter belongs to (`usage_logs.date`): it is bucketed in the server's default time zone, and the usage meter's `resetsAt` is the next midnight in that zone.
