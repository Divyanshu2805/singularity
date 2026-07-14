# Projects

## `ProjectController` (`/api/projects`)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/api/projects` | — | `List<ProjectSummaryResponse>` | The caller's own projects (any role), with `role`/`pinnedAt`/`starredAt` resolved in one query. |
| GET | `/api/projects/{id}` | — | `ProjectResponse` | Any role. 404 if not found or not a member (a soft-deleted project is also unreachable this way — see [Known Behavior](../known-gaps/api-behavior.md#known-behavior-worth-knowing-about) below on the 403-vs-404 case). |
| POST | `/api/projects` | `{ name }` | `ProjectResponse` (201) | 402 (`PROJECT_LIMIT`) if at the plan's project cap. Creates the owner's `PROJECT_MEMBER` row in the same request. |
| POST | `/api/projects/from-prompt` | `{ prompt }` | `ProjectResponse` (201) | Same as above, but the name comes from an AI call (`ProjectNameGenerator`) with a keyword-heuristic fallback, never blocking creation on a naming failure. Quota checked *before* the naming call. |
| PATCH | `/api/projects/{id}` | `{ name }` | `ProjectResponse` | `EDITOR`/`OWNER` only. |
| DELETE | `/api/projects/{id}` | — | 204 | `OWNER` or `EDITOR`. **Role-aware**: the owner soft-deletes the project for everyone; an editor's delete only removes their own membership and leaves the project untouched for the rest. |
| POST | `/api/projects/{id}/fork` | `{ name? }` | `ProjectResponse` (201) | `EDITOR`/`OWNER`, but 403 for the project's own owner (nothing to fork — they can already edit it). Copies every file inside MinIO storage without downloading bytes; a genuine copy failure rolls the whole fork back. Counts against the plan like any new project. |
| POST | `/api/projects/{id}/retry-template-init` | — | `ProjectResponse` | Re-runs starter-template copying (idempotent — only fills in what's missing). |
| PUT / DELETE | `/api/projects/{id}/pin` | — | 204 | Any role — a personal preference, not an edit. |
| PUT / DELETE | `/api/projects/{id}/star` | — | 204 | Same. Independent of pin. |

## `ProjectMemberController` (`/api/projects/{projectId}/members`)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/members` | — | `List<MemberResponse>` | Any role. |
| POST | `/members` | `{ username, role }` | `MemberResponse` (201) | `OWNER` only. 403 for inviting yourself or an existing member; 404 if no user has that username. Saves with `acceptedAt = null`. **Nothing prevents inviting someone in as `OWNER`.** |
| POST | `/members/accept` | — | `MemberResponse` | Self-scoped, no role gate needed. Idempotent — sets `acceptedAt` only if still `null`. |
| PATCH | `/members/{memberId}` | `{ role }` | `MemberResponse` | `OWNER` only. |
| DELETE | `/members/{memberId}` | — | 204 | `OWNER` only. |
