# Internal API (service-to-service)

Not part of the browser contract, and **never routed by the Gateway** (`/internal/**` matches no route). Each service exposes `/internal/v1/**` to the others, guarded by the shared secret: the caller sends `X-Internal-Service-Token` (`INTERNAL_SERVICE_SHARED_SECRET`), added automatically by `common-lib`'s `FeignClientInterceptor` for any path starting `/internal/`. A missing or wrong token is 401; a user's session cookie is not accepted here. These endpoints enforce no user permission — the caller has already authorized the request it is acting on. Callers find a service by name through Eureka. Wire types live in `common-lib`'s `dto` package.

**`account-service`** (`InternalAccountController`)

| Method | Path | Response | Notes |
|---|---|---|---|
| GET | `/internal/v1/users/{userId}` | `UserDto { id, username, name, firebaseUid }` | 404 if unknown. |
| GET | `/internal/v1/users/by-username?username=` | `UserDto` | Invite-by-email. 404 if unknown. |
| GET | `/internal/v1/users/by-firebase-uid?uid=` | `UserDto` | How workspace and intelligence turn a verified session cookie into a user. 404 if unknown. |
| GET | `/internal/v1/sessions/revoked?cookieHash=` | `boolean` | Whether that session was signed out. `RevokedSession` exists only in account's database. |
| GET | `/internal/v1/users/{userId}/plan-limits` | `PlanDto { id, name, maxProjects, maxTokensPerDay, maxPreviews, unlimitedAi }` | The *effective* plan — the free-tier fallback included, so never a 404 for a real user. |

**`workspace-service`** (`InternalWorkspaceController`, `InternalSessionController`)

| Method | Path | Response | Notes |
|---|---|---|---|
| GET | `/internal/v1/projects/{projectId}/members/{userId}` | `ProjectMembershipDto { projectId, userId, role }` | `role: null` means "not a member" (still a 200); 404 only if the project doesn't exist or is soft-deleted. What intelligence's `@PreAuthorize` checks resolve through. |
| GET | `/internal/v1/projects/{projectId}` | `ProjectSummaryDto { id, name, isPublic, deleted, templateInitIssue }` | 404 if unknown or soft-deleted. |
| GET | `/internal/v1/projects?ids=1,2,3` | `List<ProjectSummaryDto>` | Batched; soft-deleted projects included (usage insights attribute tokens spent before a delete). |
| GET | `/internal/v1/projects/{projectId}/files` | `FileTreeDto { projectId, entries: [{ path, size, type }] }` | |
| GET | `/internal/v1/projects/{projectId}/files/content?path=` | `FileContentDto { path, content }` | |
| POST | `/internal/v1/projects/{projectId}/files` | 200 | **Write.** Body `FileContentDto`. The only way a generated file reaches storage. |
| DELETE | `/internal/v1/projects/{projectId}/files?path=` | 200 | **Write.** |
| GET | `/internal/v1/projects/owned-count?userId=` | `int` | How many projects the user owns — the count half of the project-limit check. |
| POST | `/internal/v1/sessions/evict` | 204 | Body `EvictSessionRequest { cookieHash \| firebaseUid }` — exactly one set. Drops that session (or every cached session of that Firebase user) from this service's in-process cache. Sent by account on sign-out. |

**`intelligence-service`** (`InternalIntelligenceController`, `InternalSessionController`)

| Method | Path | Response | Notes |
|---|---|---|---|
| POST | `/internal/v1/sessions/evict` | 204 | As above. |
