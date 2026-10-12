# Projects

Projects and their members. **Service:** workspace-service

## Projects

**Controller:** `ProjectController` (`/api/projects`)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/projects` | — | `List<ProjectSummaryResponse>` | The caller's projects (any role), with their `role`, `summary` (the one line saying what the app is, null on older projects), `pinnedAt` and `starredAt`, the link of a live published app, and `thumbnailAt` - when the picture of the app was last taken, null while the card should keep its colours. |
| `GET` | `/api/projects/{id}` | — | `ProjectResponse` | Any role. `403` for a non-member — including for an id that doesn't exist; `404` for a deleted project the caller was a member of. See [403 vs 404](../known-gaps/api-behavior.md). |
| `POST` | `/api/projects` | `{ name }` | `ProjectResponse` (`201`) | `402` (`PROJECT_LIMIT`) at the plan's project limit. Creates the caller's `OWNER` membership in the same transaction. |
| `POST` | `/api/projects/from-prompt` | `{ prompt, name?, summary? }` | `ProjectResponse` (`201`) | As above. `name` and `summary` are the idea interview's suggestions, written by intelligence-service and passed on by the browser: the name is cut to two words and the summary to eight, both stripped of markup and control characters. With none, or an unusable one, `ProjectNameHeuristic` makes them from the prompt (a prompt of only filler words is named "Untitled project") — **no AI call** in this service, so nothing is billed. |
| `PATCH` | `/api/projects/{id}` | `{ name }` | `ProjectResponse` | `EDITOR` or `OWNER`. |
| `DELETE` | `/api/projects/{id}` | — | `204` | Any role, and **role-aware**: the owner deletes the project for everyone; anyone else's delete only removes their own membership - which is how an editor or a viewer leaves a project. |
| `GET` | `/api/projects/invitations` | — | `List<InvitationResponse>` | The invitations addressed to the caller's own email, across every project that still exists: `{ projectId, projectName, role, invitedByName, invitedAt }`. Needs no membership - the caller is not a member of any of them yet. |
| `POST` | `/api/projects/{id}/fork` | `{ name? }` | `ProjectResponse` (`201`) | `EDITOR` or `OWNER`, but `403` for the project's own owner. Copies every file within storage without downloading it; a copy failure rolls the whole fork back. Counts against the plan like any new project. |
| `POST` | `/api/projects/{id}/retry-template-init` | — | `ProjectResponse` | `EDITOR` or `OWNER`. Re-runs starter-template copying; only fills in what's missing. |
| `PUT` / `DELETE` | `/api/projects/{id}/pin` | — | `204` | Any role — a personal preference, not an edit. |
| `PUT` / `DELETE` | `/api/projects/{id}/star` | — | `204` | Any role. Independent of pin. |
| `PUT` | `/api/projects/{id}/thumbnail` | The picture's raw bytes (WebP or JPEG, at most 300 KB) | `204` | `EDITOR` or `OWNER`. Stores the picture the project's card shows, replacing the last one. The request's content type is ignored: the type is read from the bytes, and anything that is not a WebP or JPEG is a `400`. At most 40 an hour per project (`429`). It does not change the project's `updatedAt`. |
| `GET` | `/api/projects/{id}/thumbnail` | — | `image/webp` or `image/jpeg` | Any role. `404` while the project has no picture. Cacheable privately for 30 days; the app adds `?v=<thumbnailAt>` so a newer picture has a new address. |

## Members

**Controller:** `ProjectMemberController` (`/api/projects/{projectId}/members`)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `GET` | `/members` | — | `List<MemberResponse>` | Any role. The owner also gets the invitations nobody has answered yet, as entries with an `inviteId`, the invited address as `username`, and no `userId`, `name` or `acceptedAt`. |
| `POST` | `/members` | `{ username, role }` | `MemberResponse` (`201`) | `OWNER`. `username` is the invitee's email. Writes an invitation, not a membership, and answers the same way whether or not an account exists for the address. Inviting the same address again changes the role on offer. `400` for your own address, for `OWNER`, or past 20 open invitations on the project; `409` for an address that already belongs to a member. |
| `POST` | `/members/accept` | — | `MemberResponse` | The caller accepts the invitation addressed to their own email; this is what creates the membership. `404` if there is none. |
| `POST` | `/members/decline` | — | `204` | The caller declines the invitation addressed to their own email. Idempotent. |
| `DELETE` | `/members/invites/{inviteId}` | — | `204` | `OWNER`. Withdraws an invitation nobody has accepted. `404` if it does not belong to this project. |
| `PATCH` | `/members/{memberId}` | `{ role }` | `MemberResponse` | `OWNER`. `400` for granting `OWNER` or changing the owner's own role. |
| `DELETE` | `/members/{memberId}` | — | `204` | `OWNER`. `400` for the owner themselves. Also stops any AI generation the removed member had running on the project and ends their preview session. |

### Invitations

An invitation gives no access. It is held by email address until someone signed in with that address accepts it, and only then does a membership exist; sign-in requires a verified email, which is what makes holding the address proof enough. The invited person finds it on their dashboard (`GET /api/projects/invitations`).

The endpoint never says whether an address has an account: it stores and answers the same thing either way, and an unanswered invitation is listed by address alone. The one thing it does reveal - an address already on the project - the owner can read in the member list anyway. A project has exactly one owner: it cannot be granted by invitation or by a role change, and the owner can be neither demoted nor removed.

## Related

- [`PROJECT` and `PROJECT_MEMBER`](../schema/workspace-service.md) — ownership, soft delete, pin and star.
- [Roles and permissions](../schema/enums.md).
