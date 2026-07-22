# The Three Databases

All three live on one local Postgres server (the `pgvector-vibecraft` container, port 9010). Database names and credentials are in each service's `application.yaml`.

| Service | Database | Tables | Entities |
|---|---|---|---|
| `account-service` | `vibecraft-account-db` | `users`, `plans`, `subscriptions`, `auth_audit_events`, `revoked_sessions` (plus the orphaned `password_reset_tokens`, below) | `User`, `Plan`, `Subscription`, `AuthAuditEvent`, `RevokedSession` |
| `workspace-service` | `vibecraft-workspace-db` | `projects`, `project_members`, `project_files`, `previews`, `preview_sessions` | `Project`, `ProjectMember` (+ `ProjectMemberId`), `ProjectFile`, `Preview`, `PreviewSession` |
| `intelligence-service` | `vibecraft-intelligence-db` | `chat_sessions`, `chat_messages`, `chat_events`, `code_notes`, `usage_events`, `usage_logs` | `ChatSession` (+ `ChatSessionId`), `ChatMessage`, `ChatEvent`, `CodeNote`, `UsageEvent`, `UsageLog` |

16 entity types plus two `@Embeddable` composite-key classes (`ProjectMemberId`, `ChatSessionId`). Every entity carries a `Long id` (`BIGSERIAL`) unless it uses a composite key, and — where it has them — `createdAt`/`updatedAt` via Hibernate's `@CreationTimestamp`/`@UpdateTimestamp`.

**Timestamps** are `timestamp without time zone` holding UTC wall-clock time (the one-off data migration converted the old monolith's `timestamptz` columns to that on the way in). The one exception is the *day* an AI-usage counter belongs to (`usage_logs.date`): it is bucketed in the server's default zone, and `resetsAt` is the next midnight in that zone.
