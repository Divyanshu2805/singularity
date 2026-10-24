# Data model

Three Postgres databases, one per service. Flyway owns every schema and Hibernate only validates it. A reference into another service's database is a plain id with no foreign key (dashed lines below).

| Convention | |
|---|---|
| Schema changes | A new `V<n>__*.sql` migration. Never edit an applied one |
| Enums | `VARCHAR`, with no `CHECK` constraint, so adding a value needs no migration |
| Soft delete | Nullable `deleted_at` on users, projects and chat sessions. Every query filters it |
| Ownership | A `project_members` row with `project_role = OWNER`. Projects have no owner column |
| Upserts | Native `INSERT … ON CONFLICT` where a duplicate must be caught |

## account

```mermaid
erDiagram
    users ||--o{ subscriptions : has
    plans ||--o{ subscriptions : "billed as"
    users ||--o| checkout_intents : starts
    plans ||--o{ checkout_intents : for
    users ||--o{ auth_audit_events : logs
    users {
        bigint id PK
        string username
        string firebase_uid UK
        string stripe_customer_id
        timestamp deleted_at
    }
    plans {
        bigint id PK
        string stripe_price_id
        int max_projects
        int max_tokens_per_day
        int max_previews
    }
    subscriptions {
        bigint id PK
        bigint user_id FK
        bigint plan_id FK
        string stripe_subscription_id UK
        string status
        timestamp current_period_end
        timestamp past_due_since
    }
```

`revoked_sessions` holds signed-out cookie hashes until they expire. `webhook_events` records each Stripe event id once, so a repeated delivery is ignored.

## workspace

```mermaid
erDiagram
    projects ||--o{ project_members : has
    projects ||--o{ project_invites : has
    projects ||--o{ project_files : has
    projects ||--o{ project_file_revisions : has
    project_file_revisions ||--o{ project_file_revision_entries : contains
    project_file_revisions ||--o| project_file_revisions : parent
    projects ||--o{ previews : runs
    previews ||--o{ preview_sessions : watched_by
    projects ||--o| published_apps : publishes
    projects ||--o| project_github_repos : pushes_to
    projects {
        bigint id PK
        string name
        boolean is_public
        bigint forked_from_project_id
        bigint current_file_revision_id FK
        timestamp deleted_at
    }
    project_members {
        bigint project_id PK
        bigint user_id PK
        string project_role
        timestamp accepted_at
    }
    project_files {
        bigint id PK
        string path
        string minio_object_key
        string content_hash
    }
    project_file_revisions {
        bigint id PK
        bigint parent_revision_id FK
        string status
        string source
    }
    project_file_revision_entries {
        bigint revision_id FK
        string path
        string change_type
        string content_hash
        string previous_content_hash
    }
```

| Table | Notes |
|---|---|
| `project_files` | Metadata only. Bytes live in MinIO at `{projectId}/{path}`, and blobs at `blob/<sha256>` |
| `project_file_revisions` | `STAGING` → `APPLIED`, `FAILED` or `CONFLICT`. Source is `AI_GENERATION`, `MANUAL_EDIT` or `RESTORE` |
| `previews` | One runner pod per project: pod name, status, synced revision, failure kind |
| `preview_sessions` | One per collaborator watching, so one person stopping doesn't kill it for everyone |
| `published_apps` | Slug, the live build prefix (`b<N>/`), and the in-progress build with its pod and heartbeat |
| `github_connections` | Encrypted GitHub token per user |

`project_members.user_id`, `project_invites` and `github_connections` point at account users by id.

## intelligence

```mermaid
erDiagram
    chat_sessions ||--o{ chat_messages : has
    chat_messages ||--o{ chat_events : has
    chat_sessions {
        bigint project_id PK
        bigint user_id PK
        timestamp deleted_at
    }
    chat_messages {
        bigint id PK
        string role
        text content
        int tokens_used
        boolean teaching
        bigint revision_id
    }
    chat_events {
        bigint id PK
        string type
        int sequence_order
        text content
        string file_path
        text lesson
        text task
    }
```

| Table | Notes |
|---|---|
| `chat_events` | One thing a turn did: thought, message, step, file edit or delete, question, tool call, outcome |
| `usage_logs` | Tokens per user per day, checked on every AI call |
| `usage_events` | Append-only ledger for the usage page, written in the same transaction |
| `code_notes` | Private notes from code insight |
| `project_tours`, `glossary_entries` | Written once per person, on request |

Chat is per person per project: a collaborator has their own session.
