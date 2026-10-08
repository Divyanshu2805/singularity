# Where Do I Change…?

A task-oriented index into the code. Paths are relative to each service's `src/main/java/com/singularity/<service>/` unless they start with a module name.

## AI and generation

| I want to… | Look at |
|---|---|
| Change what the AI is instructed to do or how it writes code | intelligence `llm/PromptUtils.java` (code generation); `llm/CodeInsightPrompts.java` (read-only code insight — kept separate on purpose) |
| Add an AI-callable tool | intelligence `llm/tools/CodeGenerationTools.java`. Think hard before giving anything but the generation path a write-capable tool — see [AI prompt boundaries](security-model.md#ai-prompt-boundaries) |
| Change what counts as billable AI usage | intelligence `enums/UsageFeature.java`, `llm/AiUsageRecorder.java`, and tag the new call site |

## Files and revisions

| I want to… | Look at |
|---|---|
| Change how generated files are persisted | workspace `service/impl/RevisionPublisherImpl.java` and `RevisionManifestStore.java`, the `publishRevision` endpoint on `InternalWorkspaceController`; intelligence `service/impl/TurnRecorder.java` |
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
| Change the line for a runner when every one is busy | workspace `PreviewBootstrapper.waitForRunner`, `PreviewRepository.countWaitingAhead` / `assignPod`; `preview.queue-timeout` |
| Change how a running preview keeps up with saved changes, or when it reinstalls | workspace `service/impl/PreviewSynchronizer.java`; the copy itself is `PreviewBootstrapper.mirrorOnce` |
| Change the sentence or the cause given for a failed start | workspace `util/PreviewFailureExplainer.java` (`PreviewFailureKind`); the title per kind is `previewFailureTitle` in `frontend/src/lib/preview.ts` |
| Change what the previewed page reports or accepts (errors, console, blank page, back and forward) | `proxy/reporter.js` **and** `frontend/src/lib/preview-frame.ts` — they must agree on the message names |
| Change who may restart a preview | workspace `PreviewDeploymentServiceImpl.restartPreview`'s `@PreAuthorize`; `PreviewAuthorizationTest` |
| Change the real-cluster preview test or the cluster it runs on | workspace `PreviewPipelineIT` (test code), `k8s/preview-test-cluster.sh`, the `preview-pipeline` job in `.github/workflows/ci.yml` |
| Change the preview access-token scheme | workspace `util/PreviewAccessToken.java` **and** `proxy/auth.js` — they must stay byte-for-byte compatible (`PreviewAccessTokenTest` and `proxy/auth.test.js` pin the same value); `preview.access-token-*` in `application.yaml` |

## Frontend

| I want to… | Look at |
|---|---|
| Change chat rendering | `frontend/src/components/ChatEventRenderer.tsx` (the thought process, the build card and its lesson buttons), `frontend/src/lib/brief.ts` (how much of the person's own message is shown), `frontend/src/lib/project-chat-store.ts` (state) |
| Change how a change to part of a file is found and applied, or what is checked before a turn is saved | `llm/FileEdits.java`, `llm/SyntaxCheck.java`, and `BuildTurn.repair` — and then run one real turn ([testing](../practices/testing.md#what-automated-tests-dont-cover)) |
| Change what the model says or how much it builds | `llm/PromptUtils.java` — and then run one real turn ([testing](../practices/testing.md#what-automated-tests-dont-cover)) |
| Change the starter template | The files under `workspace-service/src/main/resources/starter-templates/` and their `MANIFEST.txt`; `StarterTemplateSeeder` replaces changed files in storage on the next start. Keep `PromptUtils`' conventions in step with it |
| Change which project files the model is shown before it builds | intelligence `llm/ProjectBrief.java` (the budget and the choice of files) |
| Change which model or how much reasoning a kind of call uses | `ai.calls.<kind>` in intelligence `application.yaml`; `config/AiCallProperties.java`, `llm/ModelCalls.java`, `enums/AiCallKind.java` - and measure it with the build benchmark |
| Change what a turn is told about the conversation before it | intelligence `llm/ConversationMemory.java` |
| Change the type-check of a turn's files in the preview pod | workspace `service/impl/CodeCheckServiceImpl.java` and `util/TypeCheckOutput.java`; the caller is intelligence `service/impl/PreviewCodeChecker.java`, used by `BuildTurn.inspect` |
| Change the UI kit generated apps use | The starter template, the kit's section of `llm/PromptUtils.java` and `llm/UiKit.java` together; `KitPromptMatchesTemplateTest` fails if they disagree. The runner image is built from the template's `package.json` |
| Change the suggested next steps | intelligence `llm/SuggestionPrompts.java`, `service/impl/SuggestionServiceImpl.java`; frontend `lib/project-chat-store.ts` and `components/ChatPanel.tsx` |
| Change the **Fix this** request for a preview error | frontend `lib/preview-fix.ts`, `components/RuntimeErrorAlert.tsx` |
| Change what the scripted model answers | intelligence `llm/stub/StubReplies.java`; `StubBuildTurnTest` runs it through whole turns |
| Change the benchmark's requests or how a turn is judged | intelligence `src/test/resources/bench/scenarios.json`, `service/impl/BuildBenchmark.java` (test code) |
| Change how the answer's text is read in the browser | `frontend/src/lib/generation-protocol.ts` — and the server's `llm/GenerationProtocol.java` with it; add the case to `intelligence-service/src/test/resources/protocol/cases.json` first |
| Change what the preview tab does after a response | `previewFollowUp` in `frontend/src/lib/preview.ts`, called from `frontend/src/pages/ProjectView.tsx` — only the reload of a frame that had shown an error; bringing the runner level and installing packages is the server's `PreviewSynchronizer` |
| Change auth or session handling | `frontend/src/lib/firebase-auth.ts`, `frontend/src/lib/session.ts` |
| Add a module-level store | Register it with `onSignOut(...)` in `frontend/src/lib/session.ts` — required, see [sign-out data isolation](security-model.md#sign-out-data-isolation-frontend) |
