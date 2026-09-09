# Where Do I Change…?

A task-oriented index into the code. Paths are relative to each service's `src/main/java/com/vibecraft/<service>/` unless they start with a module name.

## AI and generation

| I want to… | Look at |
|---|---|
| Change what the AI is instructed to do or how it writes code | intelligence `llm/PromptUtils.java` (code generation); `llm/CodeInsightPrompts.java` (read-only code insight — kept separate on purpose) |
| Add an AI-callable tool | intelligence `llm/tools/CodeGenerationTools.java`. Think hard before giving anything but the generation path a write-capable tool — see [AI prompt boundaries](security-model.md#ai-prompt-boundaries) |
| Change what counts as billable AI usage | intelligence `enums/UsageFeature.java`, `llm/AiUsageRecorder.java`, and tag the new call site |

## Files and revisions

| I want to… | Look at |
|---|---|
| Change how generated files are persisted | workspace `service/impl/RevisionPublisherImpl.java` and `RevisionManifestStore.java`, the `publishRevision` endpoint on `InternalWorkspaceController`; intelligence `AiGenerationServiceImpl.commitFileChanges` |
| Change how files are read | workspace `service/impl/ProjectFileServiceImpl.java` |
| Add a pre-publish check (lint, tests, …) | Implement workspace `service/RevisionValidator.java` as a `@Component`, like `service/impl/RevisionBuildValidator.java` |
| Change or enable the build validation | `revision-validation.*` in workspace-service's `application.yaml` — no code change needed for a different check command |
| Change which file paths are allowed | workspace `util/ProjectFilePath.java` |

## API, data and permissions

| I want to… | Look at |
|---|---|
| Add a REST endpoint | The owning service's `controller/` and DTOs, the [API reference](../api/README.md) — and, if the path prefix is new, the Gateway route plus `RoutingTableTest` in the same change (an unrouted path is a 404) |
| Add a service-to-service call | An `Internal*Controller` endpoint in the owner, a method on the caller's `feign/` client (no `@FeignClient(path = …)`), a `common-lib` DTO if the payload is shared, and the table in [service communication](service-communication.md#internal-api) |
| Add a column or table | The entity **and** a new Flyway migration `V<n>__….sql` in that service's `src/main/resources/db/migration/`, then the [data model](../schema/README.md) |
| Change a permission or role rule | workspace `enums/ProjectRole.java` (the permission mapping) **and** `common-lib`'s wire `dto/ProjectRole` (they must agree); `security/SecurityExpressions.java` in workspace and intelligence |
| Change quota or plan limits | account `service/SubscriptionService.java` (the `FREE_TIER_*` constants) and `config/PlanSeeder.java` (paid plans). They must never disagree — see [`PLAN`](../schema/account-service.md#subscription--plan) |
| Change the error shape or a status mapping | `common-lib` `error/GlobalExceptionHandler.java` — all three services pick it up |

## Sessions and security

| I want to… | Look at |
|---|---|
| Change how sessions or rate limits work | `common-lib` `security/` (shared by every service); account-service's `service/impl/SessionServiceImpl.java` and `security/LocalSessionAuthenticator.java` for sign-in and sign-out |
| Change the internal-API guard | `common-lib` `security/InternalServiceAuthFilter.java`, `ServiceSecurityConfig`, and account-service's `WebSecurityConfig` |

## Live previews

| I want to… | Look at |
|---|---|
| Change how previews are provisioned | workspace `service/impl/PreviewRunnerPool.java`, `PreviewBootstrapper.java`; the pod spec in `k8s/runner-pods.yml` (local) and `deploy/k8s/base/runner-pods.yaml` (deployed) |
| Change preview routing or proxying | workspace `service/impl/PreviewRouter.java`, `proxy/index.js`, `proxy/routing.js` |
| Change the preview access-token scheme | workspace `util/PreviewAccessToken.java` **and** `proxy/auth.js` — they must stay byte-for-byte compatible (`PreviewAccessTokenTest` and `proxy/auth.test.js` pin the same value); `preview.access-token-*` in `application.yaml` |

## Frontend

| I want to… | Look at |
|---|---|
| Change chat rendering | `frontend/src/components/ChatEventRenderer.tsx` (blocks and checklist), `frontend/src/lib/project-chat-store.ts` (state) |
| Change auth or session handling | `frontend/src/lib/firebase-auth.ts`, `frontend/src/lib/session.ts` |
| Add a module-level store | Register it with `onSignOut(...)` in `frontend/src/lib/session.ts` — required, see [sign-out data isolation](security-model.md#sign-out-data-isolation-frontend) |
