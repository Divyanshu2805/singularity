# 6. Where Do I Change…?

| I want to… | Look at |
|---|---|
| Change what the AI is instructed to do/how it writes code | `intelligence-service` `llm/PromptUtils.java` (code generation), `llm/CodeInsightPrompts.java` (read-only code insight — kept separate on purpose) |
| Add a new AI-callable tool | `llm/tools/CodeGenerationTools.java` — and think hard before adding a write-capable tool to anything but the generation path |
| Change how a generated file gets persisted | `workspace-service` `service/impl/RevisionPublisherImpl.java`/`RevisionManifestStore.java` (the stage→manifest→apply→CAS pipeline, CODE_REVIEW.md AI-05) and `InternalWorkspaceController`'s `publishRevision` endpoint in front of it; `intelligence-service` `AiGenerationServiceImpl.commitFileChanges`. Reading a file's tree/content is still `ProjectFileServiceImpl.java`. |
| Add a REST endpoint | the owning service's `controller/`, its request/response DTOs, `docs/api/` — **and** the Gateway route if the path prefix is new, with `RoutingTableTest` updated in the same change (a path no route owns is a 404) |
| Add a service-to-service call | an `Internal*Controller` endpoint under `/internal/v1` in the owner, a method on the caller's `feign/` client (no `@FeignClient(path = …)`), `common-lib` `dto/` if the payload is shared — and the table in §3 |
| Add a DB column or table | the entity, **and a new Flyway migration** `V<n>__….sql` in that service's `src/main/resources/db/migration/` (Hibernate only validates), then `docs/schema/` |
| Change a permission/role rule | workspace `enums/ProjectRole.java` (the permission-set mapping) **and** common-lib's wire `dto/ProjectRole` (must agree), `security/SecurityExpressions.java` in workspace and intelligence |
| Change quota/plan limits | account `service/SubscriptionService.java` (the `FREE_TIER_*` constants) and `config/PlanSeeder.java` (paid-plan seeding) — these two must never disagree, see `docs/schema/`'s `PLAN` entity |
| Change what counts as billable AI usage | intelligence `enums/UsageFeature.java`, `llm/AiUsageRecorder.java`, and tag the new call site |
| Change how sessions or rate limits work | `account-service` `service/impl/SessionServiceImpl.java` and `security/`; then the **same** change in workspace's and intelligence's `security/` (three copies) |
| Change the error shape or a status mapping | `common-lib` `error/GlobalExceptionHandler.java` (all three services pick it up) |
| Change how live previews are provisioned | workspace `service/impl/PreviewRunnerPool.java`/`PreviewBootstrapper.java`, `k8s/runner-pods.yml` (the pod spec itself) |
| Change preview routing/proxying | workspace `service/impl/PreviewRouter.java`, `proxy/index.js`, `k8s/vibecraft-proxy.yml` |
| Change the preview access-token scheme | workspace `util/PreviewAccessToken.java` **and** `proxy/auth.js` (must stay byte-for-byte identical - see `PreviewAccessTokenTest`'s and `proxy/auth.test.js`'s matching known-good HMAC value), `preview.access-token-secret`/`-ttl` in `application.yaml` |
| Change frontend chat rendering | `frontend/src/components/ChatEventRenderer.tsx` (the block/checklist builder), `frontend/src/lib/project-chat-store.ts` (the module-level state) |
| Change frontend auth/session handling | `frontend/src/lib/firebase-auth.ts`, `frontend/src/lib/session.ts` (the sign-out teardown registry — see §7) |
| Add a new client-side module-level store | Register it with `frontend/src/lib/session.ts`'s `onSignOut(...)` — see §7, this is not optional |
