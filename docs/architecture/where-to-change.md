# 5. Where Do I Change…?

| I want to… | Look at |
|---|---|
| Change what the AI is instructed to do/how it writes code | `llm/PromptUtils.java` (code generation), `llm/CodeInsightPrompts.java` (read-only code insight — kept separate on purpose) |
| Add a new AI-callable tool | `llm/tools/CodeGenerationTools.java` — and think hard before adding a write-capable tool to anything but the generation path |
| Change how a generated file gets persisted | `service/impl/ProjectFileServiceImpl.java`, `service/impl/AiGenerationServiceImpl.finalizeChats` |
| Add a REST endpoint | the relevant `controller/`, plus its request/response DTOs under `dto/`, plus `docs/api/` |
| Add a DB column/entity | `entity/`, then check whether it's a persisted enum first — `docs/schema/`'s `ddl-auto` trap — then update `docs/schema/` |
| Change a permission/role rule | `enums/ProjectRole.java` (the permission-set mapping), `security/SecurityExpressions.java` (what `@security.canX(...)` actually checks) |
| Change quota/plan limits | `service/SubscriptionService.java` (the `FREE_TIER_*` constants) and `config/PlanSeeder.java` (paid-plan seeding) — these two must never disagree, see `docs/schema/`'s `PLAN` entity |
| Change what counts as billable AI usage | `enums/UsageFeature.java`, `llm/AiUsageRecorder.java`, and tag the new call site |
| Change how live previews are provisioned | `service/impl/PreviewRunnerPool.java`/`PreviewBootstrapper.java`, `k8s/runner-pods.yml` (the pod spec itself) |
| Change preview routing/proxying | `service/impl/PreviewRouter.java`, `proxy/index.js`, `k8s/vibecraft-proxy.yml` |
| Change frontend chat rendering | `frontend/src/components/ChatEventRenderer.tsx` (the block/checklist builder), `frontend/src/lib/project-chat-store.ts` (the module-level state) |
| Change frontend auth/session handling | `frontend/src/lib/firebase-auth.ts`, `frontend/src/lib/session.ts` (the sign-out teardown registry — see §6) |
| Add a new client-side module-level store | Register it with `frontend/src/lib/session.ts`'s `onSignOut(...)` — see §6, this is not optional |
