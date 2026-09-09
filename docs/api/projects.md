# Projects

Projects and their members. **Service:** workspace-service

## Projects

**Controller:** `ProjectController` (`/api/projects`)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/projects` | — | `List<ProjectSummaryResponse>` | The caller's projects (any role), with their `role`, `pinnedAt` and `starredAt`. |
| `GET` | `/api/projects/{id}` | — | `ProjectResponse` | Any role. `403` for a non-member — including for an id that doesn't exist; `404` for a deleted project the caller was a member of. See [403 vs 404](../known-gaps/api-behavior.md). |
| `POST` | `/api/projects` | `{ name }` | `ProjectResponse` (`201`) | `402` (`PROJECT_LIMIT`) at the plan's project limit. Creates the caller's `OWNER` membership in the same transaction. |
| `POST` | `/api/projects/from-prompt` | `{ prompt }` | `ProjectResponse` (`201`) | As above, with the name derived from the prompt by a keyword heuristic — **no AI call**, so nothing is billed. |
| `PATCH` | `/api/projects/{id}` | `{ name }` | `ProjectResponse` | `EDITOR` or `OWNER`. |
| `DELETE` | `/api/projects/{id}` | — | `204` | `EDITOR` or `OWNER`, and **role-aware**: the owner deletes the project for everyone; an editor's delete only removes their own membership. |
| `POST` | `/api/projects/{id}/fork` | `{ name? }` | `ProjectResponse` (`201`) | `EDITOR` or `OWNER`, but `403` for the project's own owner. Copies every file within storage without downloading it; a copy failure rolls the whole fork back. Counts against the plan like any new project. |
| `POST` | `/api/projects/{id}/retry-template-init` | — | `ProjectResponse` | `EDITOR` or `OWNER`. Re-runs starter-template copying; only fills in what's missing. |
| `PUT` / `DELETE` | `/api/projects/{id}/pin` | — | `204` | Any role — a personal preference, not an edit. |
| `PUT` / `DELETE` | `/api/projects/{id}/star` | — | `204` | Any role. Independent of pin. |

## Members

**Controller:** `ProjectMemberController` (`/api/projects/{projectId}/members`)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `GET` | `/members` | — | `List<MemberResponse>` | Any role. |
| `POST` | `/members` | `{ username, role }` | `MemberResponse` (`201`) | `OWNER`. `username` is the invitee's email. `403` for inviting yourself or an existing member; `404` if no account has that email. |
| `POST` | `/members/accept` | — | `MemberResponse` | The caller accepts their own invitation. Idempotent. Access doesn't wait for acceptance — an invited member can use the project immediately. |
| `PATCH` | `/members/{memberId}` | `{ role }` | `MemberResponse` | `OWNER`. |
| `DELETE` | `/members/{memberId}` | — | `204` | `OWNER`. Also stops any AI generation the removed member had running on the project. |

Nothing currently prevents inviting a second `OWNER`; see [known gaps](../known-gaps/not-yet-built.md).

## Related

- [`PROJECT` and `PROJECT_MEMBER`](../schema/workspace-service.md) — ownership, soft delete, pin and star.
- [Roles and permissions](../schema/enums.md).
