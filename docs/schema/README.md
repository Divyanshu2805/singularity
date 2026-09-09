# Data Model

The entities, tables and conventions behind VibeCraft's three databases.

Data is split across **three PostgreSQL databases, one per service**, and each service owns its schema through Flyway migrations; Hibernate only validates it. Two consequences run through every page here:

- A service can only join its own tables. A reference into another service's data is a plain id column, never a foreign key.
- Adding a column or table is a new migration, not just an entity change.

## Contents

| Page | Covers |
|---|---|
| [Databases](databases.md) | Which service owns which tables, ids and timestamps |
| [account-service](account-service.md) | Users, plans, subscriptions, checkout intents, webhook events, the auth audit trail, revoked sessions |
| [workspace-service](workspace-service.md) | Projects, members, files, file revisions, previews and preview sessions |
| [intelligence-service](intelligence-service.md) | Chat sessions, messages and events, code notes, usage counters and ledger |
| [Cross-service references](cross-service-references.md) | Every column that points into another service's database |
| [Enums](enums.md) | Roles, permissions, and every status and type value |
| [Conventions](conventions.md) | Ownership, soft delete, composite keys, enum columns, and how to change the schema |

Keep these pages in step with each service's `entity/`, `enums/` and `db/migration/` directories: update them in the same change as any schema edit.
