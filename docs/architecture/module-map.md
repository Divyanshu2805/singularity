# Module Map

What lives where, and the rules each layer follows.

## Repository layout

```
pom.xml               reactor parent — module list, shared dependencyManagement
common-lib/           shared library code (below)
discovery-service/    Eureka server
gateway-service/      Spring Cloud Gateway — application.yaml is the route table; RoutingTableTest pins every path
account-service/      the account domain
workspace-service/    the workspace domain, including the live-preview pipeline and file revisions
intelligence-service/ the AI and usage domain
infra/postgres-init/  creates each service's database on a brand-new Postgres volume
frontend/             the React SPA
proxy/                the standalone Node reverse proxy that routes preview hostnames via Redis
k8s/                  local-development manifests for the preview runner pool and proxy (kind)
deploy/               the full-stack Kubernetes topology (Kustomize) and deploy scripts
docker/               the shared Java service Dockerfile and the preview-runner image
docs/                 this documentation
```

## `common-lib`

Every class here is contributed to the consuming services by `CommonLibAutoConfiguration`, not by component scanning. A new class that must become a bean has to be registered there, or it will never exist.

| Package | Owns |
|---|---|
| `error` | `ApiError` (the one error shape), the typed exceptions, and `GlobalExceptionHandler` — shared by all three services, so an error has the same JSON shape whichever service raised it |
| `feign` | `FeignClientInterceptor`, which adds the shared-secret header to any call whose path starts `/internal/`, and `AccountServiceClient`, the one client every other service reaches user and plan data through |
| `security` | The session-authentication kit every service uses: `AuthProperties`, `AuthUtil`, `ClientInfo`, `IdentityVerifier` / `FirebaseIdentityVerifier`, `VerifiedIdentity`, `UserPrincipal`, `SessionCookies`, `SessionCache`, `SessionAuthFilter`, `RateLimiter` / `RateLimitFilter`, `RemoteSessionAuthenticator`, `InternalSessionController` (the eviction endpoint), `ServiceSecurityConfig` (the default filter chain), and `InternalServiceAuthFilter` (the shared-secret guard on `/internal/**`) |
| `dto` | The wire types services exchange — `UserDto`, `PlanDto`, `ProjectSummaryDto`, `ProjectMembershipDto`, `FileTreeDto`, `FileContentDto`, `EvictSessionRequest`, and the wire copy of `ProjectRole` / `ProjectPermission` |
| `config`, `util`, `autoconfigure` | `ClockConfig`, `AsyncConfig`, `FirebaseConfig`, `FeignResilienceConfig` (bounded Feign retries), `Hashing`, `WindowsTimezoneWorkaround`, and `CommonLibAutoConfiguration` itself |

## Inside a domain service

The three domain services share one layering. Package names are relative to `com.vibecraft.<account|workspace|intelligence>`.

| Package | Owns | Must never |
|---|---|---|
| `entity`, `enums` | JPA mappings — see the [data model](../schema/README.md) | Contain business logic |
| `repository` | Spring Data JPA interfaces; `@Query` JPQL added only when a service needs it | Decide anything — a repository answers a query |
| `mapper` | Entity ↔ DTO conversion with MapStruct, plus a few hand-written `default` methods where the shapes genuinely differ (`CodeNoteMapper`) | Duplicate what MapStruct would auto-match |
| `service` / `service.impl` | Business logic — one interface and one `@Service` implementation per concern | Be skipped — a controller never talks to a repository directly |
| `controller` | REST endpoints, `@PreAuthorize` gates, request/response mapping. Each service also has `Internal*Controller`s under `/internal/v1` for the other services | Contain business logic beyond orchestrating a service call |
| `dto` | Request and response records, one subpackage per domain | Carry validation annotations on a *response* record |
| `security` | Only what a service cannot share (below) | Be bypassed by a controller reading a user id from anywhere but `AuthUtil` |
| `feign` (workspace, intelligence) | Typed clients for the other services' internal APIs | Carry a `@FeignClient(path = "...")` prefix — see [service communication](service-communication.md#calling-another-service) |
| `config` | Bean wiring — Stripe, MinIO, Spring AI, Kubernetes, Redis, the plan-seeding `ApplicationRunner` | Live outside the service's component-scan root |
| `util` | Small, framework-free, directly unit-testable helpers | Depend on Spring, a repository, or anything not passed in as a plain argument |

### What each service adds

- **account-service** — `security/` holds `LocalSessionAuthenticator` (it owns the `users` and `revoked_sessions` tables, so it reads them directly instead of calling an internal API), `SessionEvictionNotifier`, and its own `WebSecurityConfig` (it is the only service with public routes: the CSRF token, sign-in, sign-out, the plan catalogue and the Stripe webhook). `service.impl` holds `SessionServiceImpl`, `SubscriptionServiceImpl`, and `StripePaymentProcessor` behind `PaymentProcessor`.
- **workspace-service** — `service.impl` holds the live-preview pipeline: `PreviewDeploymentServiceImpl` (start, stop, restart, per-project locking), `PreviewRunnerPool` (claims a warm pod), `PreviewBootstrapper` (files → install → dev server), `PreviewRouter` (Redis routes), and `PreviewLifecycle` / `PreviewReaper` (teardown and the idle sweep). It also holds the revision pipeline (`RevisionPublisherImpl`, `RevisionServiceImpl`, `RevisionSnapshotReader`, `RevisionBuildValidator` — see [File revisions](file-revisions.md)) and `ProjectTemplateServiceImpl`, which copies the starter template into a new project. The template itself ships in the repository under `src/main/resources/starter-templates/` and is uploaded to MinIO at startup by `config/StarterTemplateSeeder`. `util/` holds `CodeSearchScanner`, `ProjectNameHeuristic`, `PreviewAccessToken`, and `ProjectFilePath` — the one definition of a valid stored file path.
- **intelligence-service** — `llm/` holds the code-generation prompt, response parser, tools and advisors; the code-insight prompts; teaching mode; and usage recording. `service.impl` holds `AiGenerationServiceImpl` (the build pipeline), `GenerationRegistry` (in-flight generations), `CodeInsightServiceImpl`, `IdeaServiceImpl`, `UsageServiceImpl` and `UsageInsightsServiceImpl`. `service/ProjectFileReader` is the read-only file view the code-insight path is typed against (see [security model](security-model.md#ai-prompt-boundaries)).

### How the shared security kit is customised

Every service authenticates its own requests rather than trusting the Gateway, but the machinery lives once, in `common-lib`, so a change to session or rate-limit behaviour is made in one place.

- **account-service** supplies its own `SessionAuthenticator` and `WebSecurityConfig`. Both are `@ConditionalOnMissingBean` in the auto-configuration, so defining them is all it takes to override the defaults.
- **workspace-service** and **intelligence-service** use the shared `ServiceSecurityConfig` unchanged and keep only their own `SecurityExpressions` — the `@PreAuthorize` SpEL root. It differs because workspace reads its own membership table while intelligence asks workspace over Feign.

## Frontend (`frontend/src/`)

| Directory | Owns | Must never |
|---|---|---|
| `pages/` | Top-level routed views (`ProjectView.tsx`, `ProjectsDashboard.tsx`, `BillingSettings.tsx`, …) | Hold logic that isn't specific to that page — extract it to `lib/` or `hooks/` |
| `components/` | Feature components. `components/ui/` is the vendored shadcn/ui primitive set (Radix UI + Tailwind variants), treated as a library rather than app code | Import app-specific state from inside `components/ui/` |
| `hooks/` | Custom React hooks — most wrap a `lib/` store or add React lifecycle around it | Contain logic that doesn't need React (put it in `lib/` and test it there) |
| `lib/` | The API client, SSE parsing, module-level state stores (chat, code notes), and the framework-free logic most frontend tests exercise | Import from `components/` or `pages/` — the dependency direction is one-way |

**Module-level stores instead of a global state library.** The streaming chat transcript (`lib/project-chat-store.ts`) and the code-notes threads (`lib/code-lens-store.ts`) live in plain module-level maps rather than React context. They persist for the life of the page, not of a component — which is why `lib/session.ts` keeps an `onSignOut(...)` registry that every such store must join. See [sign-out data isolation](security-model.md#sign-out-data-isolation-frontend).

The frontend has its own [README](../../frontend/README.md) with setup and scripts.
