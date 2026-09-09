# Internal API

The service-to-service API. It is not part of the browser contract and is **never routed by the Gateway**.

- **Authentication:** the caller sends `X-Internal-Service-Token: <INTERNAL_SERVICE_SHARED_SECRET>`. `common-lib`'s `FeignClientInterceptor` adds it automatically to any path starting `/internal/`. A missing or wrong token is `401`; a user's session cookie is not accepted.
- **Authorization:** none. These endpoints trust that the calling service has already authorized the user request it is acting on. See the [security model](../architecture/security-model.md#internal-api-boundary).
- **Discovery:** callers resolve each service by name through Eureka.
- **Wire types** live in `common-lib`'s `dto` package.

## account-service

`InternalAccountController`

| Method | Path | Response | Notes |
|---|---|---|---|
| `GET` | `/internal/v1/users/{userId}` | `UserDto { id, username, name, firebaseUid }` | `404` if unknown. |
| `GET` | `/internal/v1/users/by-username?username=` | `UserDto` | Used for invite by email. `404` if unknown. |
| `GET` | `/internal/v1/users/by-firebase-uid?uid=` | `UserDto` | How workspace and intelligence turn a verified session into a user. `404` if unknown. |
| `GET` | `/internal/v1/sessions/revoked?cookieHash=` | `boolean` | Whether that session was signed out. Revocations exist only in account's database. |
| `GET` | `/internal/v1/users/{userId}/plan-limits` | `PlanDto { id, name, maxProjects, maxTokensPerDay, maxPreviews, unlimitedAi }` | The *effective* plan, including the free-tier fallback, so never a `404` for a real user. |

## workspace-service

`InternalWorkspaceController`, plus the shared `InternalSessionController`

| Method | Path | Response | Notes |
|---|---|---|---|
| `GET` | `/internal/v1/projects/{projectId}/members/{userId}` | `ProjectMembershipDto { projectId, userId, role }` | `role: null` means "not a member" (still `200`). `404` only if the project doesn't exist or is deleted. intelligence-service's permission checks resolve through this. |
| `GET` | `/internal/v1/projects/{projectId}` | `ProjectSummaryDto { id, name, isPublic, deleted, templateInitIssue }` | `404` if unknown or deleted. |
| `GET` | `/internal/v1/projects?ids=1,2,3` | `List<ProjectSummaryDto>` | Batched. Deleted projects are included, so usage insights can attribute tokens spent before a delete. |
| `GET` | `/internal/v1/projects/owned-count?userId=` | `int` | How many projects the user owns — the count half of the project-limit check. |
| `GET` | `/internal/v1/projects/{projectId}/files` | `FileTreeDto { projectId, entries: [{ path, size, type }] }` | |
| `GET` | `/internal/v1/projects/{projectId}/files/content?path=` | `FileContentDto { path, content }` | |
| `POST` | `/internal/v1/projects/{projectId}/revisions` | `PublishRevisionResponse` | **The only write path for project files.** Body: `PublishRevisionRequest { expectedParentRevisionId, createdByUserId, source, changes: [{ path, changeType: EDIT \| DELETE, content }] }`. Publishes one AI turn's changes as a single all-or-nothing revision. See [File revisions](../architecture/file-revisions.md). |
| `GET` | `/internal/v1/previews/running-count?userId=` | `int` | The user's open preview sessions — the same count the preview quota is checked against. |
| `POST` | `/internal/v1/sessions/evict` | `204` | Body: `EvictSessionRequest { cookieHash \| firebaseUid }`, exactly one set. Drops that session, or every cached session of that Firebase user, from this instance's cache. Sent by account-service on sign-out. |

## intelligence-service

`InternalIntelligenceController`, plus the shared `InternalSessionController`

| Method | Path | Response | Notes |
|---|---|---|---|
| `POST` | `/internal/v1/projects/{projectId}/generation/stop?userId=` | `200` | Stops in-flight generations that a project delete or member removal just revoked — only that user's if `userId` is given, every generation on the project otherwise. Sent by workspace-service. Best-effort: generation re-checks access before committing files regardless. |
| `POST` | `/internal/v1/sessions/evict` | `204` | As above. |
