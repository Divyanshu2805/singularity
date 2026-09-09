# Cross-Service References

A column that names something in another service's database is a **plain id**: no foreign key, no join. When the data is needed, the owning service is asked for it over its [internal API](../architecture/service-communication.md#internal-api).

| Column | Refers to | Owned by |
|---|---|---|
| `project_members.user_id`, `previews.started_by_user_id`, `preview_sessions.user_id`, `project_file_revisions.created_by_user_id` | `users.id` | account-service |
| `chat_sessions.user_id`, `chat_messages.user_id`, `code_notes.user_id`, `usage_events.user_id`, `usage_logs.user_id` | `users.id` | account-service |
| `chat_sessions.project_id`, `chat_messages.project_id`, `code_notes.project_id`, `usage_events.project_id` | `projects.id` | workspace-service |

## What this means in practice

- **Dangling ids are possible.** Nothing in the database prevents a reference to a user or project that no longer exists, and code reading these columns must tolerate it.
- **Usage deliberately outlives its project.** The usage-insights page attributes tokens spent before a project was deleted, and asks workspace-service for deleted projects' names for that reason.
- **Deletes don't cascade across services.** Deleting a project in workspace-service leaves its chat, notes and usage rows in intelligence-service.

## Plain ids within one database

A few same-database references are plain columns too, on purpose:

| Column | Why it isn't a foreign key |
|---|---|
| `projects.forked_from_project_id` | A fork keeps working after its source project is deleted. |
| `preview_sessions.project_id` | Denormalised from its preview, so "this user's session on this project" is a single-table lookup. |
| `projects.current_file_revision_id`, `project_files.current_revision_id`, `project_file_revisions.parent_revision_id` | The revision chain is walked by id with a recursive query, not loaded as an object graph. |
