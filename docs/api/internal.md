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
| — | — | — | There is no lookup by email address. Invitations are matched to the session of whoever accepts, so no service needs to ask whether an address has an account. |
| `GET` | `/internal/v1/users/by-firebase-uid?uid=` | `UserDto` | How workspace and intelligence turn a verified session into a user. `404` if unknown **or deleted**, so a deleted account's cookie authenticates on no service. |
| `GET` | `/internal/v1/sessions/revoked?cookieHash=` | `boolean` | Whether that session was signed out. Revocations exist only in account's database. |
| `GET` | `/internal/v1/users/{userId}/plan-limits` | `PlanDto { id, name, maxProjects, maxTokensPerDay, maxPreviews, unlimitedAi }` | The *effective* plan, including the free-tier fallback, so never a `404` for a real user. |

## workspace-service

`InternalWorkspaceController`, plus the shared `InternalSessionController`

| Method | Path | Response | Notes |
|---|---|---|---|
| `GET` | `/internal/v1/projects/{projectId}/members/{userId}` | `ProjectMembershipDto { projectId, userId, role }` | `role: null` means "not a member" (still `200`). `404` only if the project doesn't exist or is deleted. intelligence-service's permission checks resolve through this. |
| `GET` | `/internal/v1/projects/{projectId}` | `ProjectSummaryDto { id, name, isPublic, deleted, templateInitIssue }` | `404` if unknown or deleted. |
| `GET` | `/internal/v1/projects?ids=1,2,3` | `List<ProjectSummaryDto>` | Batched. Deleted projects are included, so usage insights can attribute tokens spent before a delete. |
| `POST` | `/internal/v1/users/{userId}/delete-data` | — | Called by account-service while deleting an account, body `DeleteUserDataRequest { email }`: deletes every project the user owns and leaves the rest (the same code as doing it by hand), deletes invitations sent to that address or by the user, and forgets the GitHub connection. Repeatable. |
| `POST` | `/internal/v1/users/{userId}/demo-project` | `ProjectSummaryDto` | Called by account-service's daily reset of the [demo account](../operations/demo-account.md), body `ProjectTitleDto { title }`: makes a project from the starter template, owned by that user and given that title. No quota check - the account's projects were all deleted a moment before. |
| `GET` | `/internal/v1/projects/owned-count?userId=` | `int` | How many projects the user owns — the count half of the project-limit check. |
| `GET` | `/internal/v1/projects/{projectId}/files` | `FileTreeDto { projectId, entries: [{ path, size, type }] }` | |
| `GET` | `/internal/v1/projects/{projectId}/files/content?path=` | `FileContentDto { path, content }` | |
| `POST` | `/internal/v1/projects/{projectId}/revisions` | `PublishRevisionResponse` | **The only write path for project files.** Body: `PublishRevisionRequest { expectedParentRevisionId, createdByUserId, source, changes: [{ path, changeType: EDIT \| DELETE, content }] }`. Publishes one AI turn's changes as a single all-or-nothing revision. A change that would take the project past its [size limits](../architecture/security-model.md#project-size-limits) is answered `FAILED` with a `reason` - one plain sentence the caller shows as it is - and nothing is stored. See [File revisions](../architecture/file-revisions.md). |
| `PUT` | `/internal/v1/projects/{projectId}/title` | `ProjectTitleDto { title }` | Body: `ProjectTitleDto { title }` - a title a model wrote. Cut to eight words and stored only while the project has no title, by one conditional update that leaves `updated_at` alone; answers with the title the project holds afterwards (a rename that landed first, or `null`). Called by `ProjectTitleServiceImpl`, which checked the caller may edit the project. |
| `POST` | `/internal/v1/projects/{projectId}/code-check` | `CodeCheckResponse { checked, skippedBecause, problems: [{ path, line, column, code, message }] }` | Body: `CodeCheckRequest { files: { path: content }, deleted: [path] }` - the files a build turn is about to save. Type-checks the project as the turn would leave it, in a scratch folder of the project's running preview pod, and looks up any package the turn adds in the npm registry. Changes nothing. `checked: false` means no check could be made (no preview running, the pod gone or slow, no `tsconfig.json`, the turn too large) and is not a failure. Only problems in the files the turn wrote are reported, and only compiler errors those files did not already have before the turn. A path that is not a plain project path is a `400`. |
| `GET` | `/internal/v1/previews/running-count?userId=` | `int` | The user's open preview sessions — the same count the preview quota is checked against. |
| `POST` | `/internal/v1/sessions/evict` | `204` | Body: `EvictSessionRequest { cookieHash \| firebaseUid }`, exactly one set. Drops that session, or every cached session of that Firebase user, from this instance's cache. Sent by account-service on sign-out. |

## intelligence-service

`InternalIntelligenceController`, plus the shared `InternalSessionController`

| Method | Path | Response | Notes |
|---|---|---|---|
| `POST` | `/internal/v1/users/{userId}/delete-data` | — | Called by account-service while deleting an account: deletes the user's chats, notes, tours, glossary and usage rows. Repeatable. |
| `POST` | `/internal/v1/projects/{projectId}/demo-build?userId=` | `200` | Called by account-service's daily reset of the [demo account](../operations/demo-account.md): records the sample project's first build - the scripted model's brief and notes app, the build the README's screenshots show - as a real turn, through the same `TurnRecorder` a build uses. No model is called and nothing is metered. Anything short of a saved turn is an error. |
| `POST` | `/internal/v1/projects/{projectId}/generation/stop?userId=` | `200` | Stops in-flight generations that a project delete or member removal just revoked — only that user's if `userId` is given, every generation on the project otherwise. Sent by workspace-service. Best-effort: generation re-checks access before committing files regardless. |
| `POST` | `/internal/v1/sessions/evict` | `204` | As above. |
