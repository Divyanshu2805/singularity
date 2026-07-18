# Phase 2 — Workspace Service (built and verified standalone; **not yet receiving real traffic**)

## What moved

Everything under `com.vibecraft.workspace` in the new `workspace-service` module, ported from `legacy-monolith`'s equivalents (same logic, `com.java.vibecraft` → `com.vibecraft.workspace`, common-lib's `ApiError`/exception taxonomy in place of local copies):

| Domain piece | From (`legacy-monolith`) | To (`workspace-service`) |
|---|---|---|
| Entities | `entity/Project,ProjectMember,ProjectMemberId,ProjectFile,Preview,PreviewSession` | `entity/` — own Postgres database, `vibecraft-workspace-db` |
| Enums | `enums/ProjectRole,ProjectPermission,PreviewStatus` | `enums/` |
| Repositories, mappers | `repository/`, `mapper/` (the 5 Workspace-owned repos, 3 mappers) | same names, `workspace.repository`/`workspace.mapper` |
| Project/member/file/template services | `ProjectService`/`Impl`, `ProjectMemberService`/`Impl`, `ProjectFileService`/`Impl`, `ProjectTemplateService`/`Impl`, `TemplateInitResult` | same names |
| Live-preview pipeline | `DeploymentService`/`KubernetesDeploymentServiceImpl`, `PreviewRunnerPool`, `PreviewBootstrapper`, `PreviewRouter`, `PreviewLifecycle`, `PreviewReaper` | `PreviewDeploymentService`/`PreviewDeploymentServiceImpl` (renamed — the plan's "unambiguous name" pass), rest unchanged |
| Controllers | `ProjectController`, `ProjectMemberController`, `FileController`, `PreviewController` | same names |
| Config | `KubernetesConfig`, `RedisConfig`, `StorageConfig`, `PreviewConfig`, `PreviewProperties`, `PreviewPortForwardProperties`, `PreviewPortForwarder` | same names, plus **`FirebaseConfig`** (see below) |
| Permission checks | `security/SecurityExpressions` | same — its `ProjectMemberRepository` dependency stays local, since `ProjectMember` now lives here |
| Full security chain | (account-service's own copy, not legacy-monolith's) | `security/*` — a second faithful copy of the Firebase/session-cookie/CSRF/rate-limit chain, **own full copy**, not delegated to gateway-service, matching account-service's Phase 1 rationale |
| **New**: internal API | — | `controller/InternalWorkspaceController` (`/internal/v1/projects/**`) — not yet called by anything (its intended caller, intelligence-service's `@security` bean, doesn't exist yet) |

**Deliberate simplification**: `ProjectServiceImpl.createProjectFromPrompt` no longer makes an AI call to name the project. Naming is `util/ProjectNameHeuristic` — the exact deterministic, framework-free fallback `legacy-monolith`'s `llm.ProjectNameGenerator` already used whenever its AI call failed, ported here as workspace-service's *only* naming strategy (zero Spring AI/OpenRouter dependency in this module). Once `intelligence-service` exists, `createProjectFromPrompt` can optionally call out to it first for an AI-quality name before falling back to the same heuristic.

**Entity changes forced by the database split** (the one complication Phase 1 didn't have to deal with — `User` was Phase 1's *own* entity, but here it's a foreign one):
- `ProjectMember.user` (a real `@ManyToOne User`/`@MapsId` JPA association) is **removed** — `ProjectMember.id.userId` (already a plain `Long` on the composite key) is now the only carrier of the user id. Username/name are resolved via `AccountServiceClient` when a response actually needs them (`ProjectMemberMapper.toMemberResponse` now takes a second `UserDto` parameter).
- `ProjectFile.createdBy`/`.updatedBy` (`@ManyToOne User`) are **dropped entirely**, not kept as plain-`Long` placeholders — confirmed dead in every reader (`ProjectFileServiceImpl`, `ProjectFileMapper`) before removing.
- `Preview.startedByUserId` and `PreviewSession.userId`/`.projectId` needed no change — already plain `Long` columns, same pattern `UsageEvent.projectId` already used for exactly this reason.

**New in this service, not a port**: `feign/AccountServiceClient` — workspace-service is **the first real Feign consumer in this codebase** (account-service's internal API existed since Phase 1 but had no caller until now). It backs: the project/preview plan-allowance checks (`assertCanCreateProject`/`assertWithinPreviewAllowance`, replacing local `SubscriptionService` calls), the invite-by-email lookup (`ProjectMemberServiceImpl.inviteMember`, replacing `UserRepository.findByUsername`), and — found only once `SessionAuthenticator` was actually ported, not anticipated up front — the session-cookie authentication path itself (see "Two account-service additions" below). Flyway (`db/migration/V1__init.sql`) replaces `ddl-auto: update`, same as Phase 1; `previews.status` is a plain `VARCHAR` with no `CHECK` constraint (a brand-new database has no `ddl-auto:update`-generated constraint to begin with — see `docs/schema/`'s persisted-enum trap for why one wasn't added by hand either).

## Two account-service additions this phase required

Porting account-service's security chain verbatim (per Phase 1's own "each service keeps its own full copy" rationale) surfaced two dependencies on data that only account-service owns, neither anticipated when `InternalAccountController` was first scaffolded in Phase 1:

- **`GET /internal/v1/users/by-firebase-uid?uid=`** — `SessionAuthenticator.authenticate()` resolves a verified Firebase uid to a local user; workspace-service has no local `User` table to resolve it against, so this now goes through account-service instead. Same shape as the existing `by-username` endpoint, backed by account-service's already-existing `UserRepository.findByFirebaseUid`.
- **`GET /internal/v1/sessions/revoked?cookieHash=`** — `SessionAuthenticator.authenticate()` also checks `RevokedSession`, which likewise only exists in account-service's database. Backed by its existing `RevokedSessionRepository.existsById`.

Both are small, additive endpoints on account-service's own module (not legacy-monolith) — the same class of "extraction surfaces a real cross-service dependency" finding Phase 1's `SubscriptionService.projectsOwned()` omission already illustrated, just discovered from the other direction this time.

## Why this hasn't been cut over yet

Same shape as Phase 1's reasoning, just for `Project` instead of `User`: flipping Gateway's routing for `/api/projects/**`, `/api/previews` to `workspace-service` today would fork project data — any project created via `workspace-service` writes to `vibecraft-workspace-db`, but `legacy-monolith`'s still-active `ChatSession`/`ChatMessage`/`CodeNote` entities have real `@ManyToOne Project` JPA associations that only resolve against `legacy-monolith`'s **own** `projects` table. A real cutover needs the same two-step recipe Phase 1 described for `User`: a one-time data migration, and `ChatSession`/`CodeNote` switched from JPA associations to plain `projectId` longs (Phase 3's job, when those entities themselves move to `intelligence-service`). Neither is done yet. Workspace-service today is built, verified, and **inert** — reachable directly on `:8082` for testing, not reachable through Gateway, not depended on by anything else. `legacy-monolith`'s own Project/Workspace-domain code is untouched — there was nothing to disconnect, since nothing outside it calls that code today either.

## Verification performed

- Full reactor compile (`./mvnw clean compile`, all 8 modules) and boot (`./mvnw -pl workspace-service spring-boot:run`) against a real, separate Postgres database (`vibecraft-workspace-db`), created via `infra/postgres-init/`.
- Flyway migrated cleanly; Hibernate's `ddl-auto: validate` confirmed the entities match exactly.
- Registered with the real local Eureka (`discovery-service`) alongside the already-running `account-service`/`gateway-service`/`legacy-monolith`.
- `PreviewReaper`'s `@Scheduled` sweep ran a real query against the new database on schedule, confirming the JPA/Postgres wiring end-to-end without needing an authenticated request.
- `InternalWorkspaceController`'s three endpoints and `InternalAccountController`'s two new endpoints (`by-firebase-uid`, `sessions/revoked`) all verified directly by real HTTP calls, both with and without the correct `X-Internal-Service-Token` — confirmed the shared-secret guard rejects a wrong token (401) and passes a correct one through to a real 404 for a nonexistent resource, on both services.
- `GET /internal/v1/users/{id}/plan-limits` verified to return the free-tier fallback (`maxProjects: 1, maxTokensPerDay: 5000, maxPreviews: 1`) for a nonexistent user, matching account-service's documented fallback behavior.
- **Not yet exercised**: the authenticated flows (`POST /api/projects`, `POST /api/projects/{id}/preview`, `ProjectMemberServiceImpl.inviteMember`) — these need a real Firebase ID token to obtain a session cookie, not scriptable without a live sign-in, the identical limitation Phase 1's own Firebase-session/Stripe verification hit. The Feign plumbing itself (`FeignClientInterceptor`'s JWT forwarding, `@FeignClient`'s Eureka-based discovery) is verified only at the unauthenticated internal-API layer so far — a full pass through an authenticated request (confirming the internal JWT actually rides along on the outbound Feign call) is the one piece left for whoever next has a live Firebase sign-in available.
- K8s/MinIO/Redis: the local `kind` cluster, MinIO, and Postgres containers were confirmed running and workspace-service's config points at the same namespace/instances legacy-monolith already uses, but an actual preview start wasn't exercised (same authenticated-request limitation above).

## Known fragile points found and fixed during this phase

- **A stale local `common-lib` Maven artifact.** After adding `CapacityUnavailableException` to `common-lib`, `workspace-service` failed at runtime with `NoClassDefFoundError` even though the reactor compiled cleanly — `mvn compile` doesn't reinstall a dependency module's jar into the local repo, so `workspace-service` was still resolving the previous `common-lib` build. Fixed by `mvn -pl common-lib install`. Any change to `common-lib` needs this before a dependent service's `spring-boot:run` will see it.
- **`CapacityUnavailableException` had no handler anywhere in this codebase**, in either `common-lib`'s or legacy-monolith's `GlobalExceptionHandler` — it fell through to the generic 500 handler despite its own javadoc promising a 503. Not a regression from this phase; a pre-existing latent bug this extraction surfaced. Fixed in `common-lib` (workspace-service is the first, and so far only, thing that throws it); legacy-monolith's own copy is untouched.
- **`FirebaseConfig` isn't in account-service's `security/` package** — it's under `config/`, so copying "the 13 security files" verbatim (as this phase's own plan specified) missed it, and the app failed at startup with "no qualifying bean of type FirebaseAuth" until it was added.
