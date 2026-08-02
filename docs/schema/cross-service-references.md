# Cross-service references

A column that names something in another service's database is a **plain id**, with no foreign key and no join. The owning service is asked for it over its internal API when it is needed (`docs/architecture/service-communication.md` §3).

| Column | Refers to | In |
|---|---|---|
| `project_members.user_id`, `previews.started_by_user_id`, `preview_sessions.user_id` | `users.id` | account |
| `chat_sessions.user_id`, `chat_messages.user_id`, `code_notes.user_id`, `usage_events.user_id`, `usage_logs.user_id` | `users.id` | account |
| `chat_sessions.project_id`, `chat_messages.project_id`, `code_notes.project_id`, `usage_events.project_id` | `projects.id` | workspace |

What that means in practice: a dangling id is possible (a user or project that no longer exists), and nothing in the database prevents it. Usage rows deliberately outlive their project — the insights page attributes tokens spent before a delete, and asks workspace for deleted projects' names for that reason.
Two same-database references are plain columns too, on purpose: `projects.forked_from_project_id` (so a fork keeps working after its source is deleted) and `preview_sessions.project_id` (denormalised from its preview, so "this user's session on this project" is a single-table lookup).
