# 2. Module Map

## Repository layout

```
pom.xml               reactor parent — module list, shared dependencyManagement
common-lib/           shared code (below)
discovery-service/    Eureka server
gateway-service/      Spring Cloud Gateway — application.yaml is the route table; RoutingTableTest pins every path
account-service/      the account domain
workspace-service/    the workspace domain, including the preview pipeline
intelligence-service/ the AI/usage domain
infra/postgres-init/  creates each service's database on a brand-new Postgres volume
frontend/             the React SPA
k8s/                  manifests for the runner pool and the preview proxy
proxy/                the standalone Node reverse proxy that routes preview hostnames via Redis
docs/                 this documentation
```

## `common-lib`

| Package | Owns |
|---|---|
| `error` | `ApiError` (the one error shape), the typed exceptions, `GlobalExceptionHandler` — shared by all three services, so an error is the same JSON whichever service raised it |
| `feign` | `FeignClientInterceptor` — adds the shared-secret header to any call whose path starts `/internal/` — and `AccountServiceClient`, the one client every other service reaches User/Plan data through |
| `security` | The whole session-authentication kit, shared by every service: `AuthProperties`, `AuthUtil`, `ClientInfo`, `IdentityVerifier`/`FirebaseIdentityVerifier`, `VerifiedIdentity`, `UserPrincipal`, `SessionCookies`, `SessionCache`, `SessionAuthFilter`, `RateLimiter`/`RateLimitFilter`, the `RemoteSessionAuthenticator` every service but account uses, `InternalSessionController` (the eviction endpoint), `ServiceSecurityConfig` (the default chain), and `InternalServiceAuthFilter` — the shared-secret guard on `/internal/**`, which grants a distinct authority a user's session cookie can never have |
| `dto` | The wire types services exchange (`UserDto`, `PlanDto`, `ProjectSummaryDto`, `ProjectMembershipDto`, `FileTreeDto`, `FileContentDto`, `EvictSessionRequest`, and the wire copy of `ProjectRole`/`ProjectPermission`) |
| `config`, `util`, `autoconfigure` | `ClockConfig`, `AsyncConfig`, `FirebaseConfig`, `Hashing`, `WindowsTimezoneWorkaround` (see §6), and `CommonLibAutoConfiguration`, which registers all of it on each consuming service without widening its component scan |

## Inside a domain service

The three domain services share one layering. Package names are relative to `com.vibecraft.<account|workspace|intelligence>`.

| Package | Owns | Must never |
|---|---|---|
| `entity`, `enums` | JPA schema — see `docs/schema/` | Contain business logic |
| `repository` | Spring Data JPA interfaces, `@Query` JPQL added only as a service needs it | Contain business logic — a repository answers a query, it doesn't decide anything |
| `mapper` | Entity↔DTO conversion (MapStruct, plus a couple of hand-written `default` methods where the shapes genuinely differ — `CodeNoteMapper`) | Duplicate what MapStruct would auto-match |
| `service` / `service.impl` | Business logic — one interface + one `@Service` impl per concern | Be skipped — a controller never talks to a repository directly |
| `controller` | REST endpoints and `@PreAuthorize` gates, request/response mapping. Each service also has `Internal*Controller`s under `/internal/v1` for the other services | Contain business logic beyond orchestrating a service call |
| `dto` | Request/response records, one subpackage per domain | Carry validation annotations on a *response* record |
| `security` | Only what a service genuinely cannot share: `SecurityExpressions` (the `@PreAuthorize` SpEL root) in workspace and intelligence, and account's own `WebSecurityConfig`, `LocalSessionAuthenticator` and `SessionEvictionNotifier`. Everything else lives in `common-lib` | Be bypassed by a controller reading `userId` from anywhere but `AuthUtil` |
| `feign` (workspace, intelligence) | Typed clients for the other services' internal APIs | Be given a `@FeignClient(path = "...")` prefix — see §3 |
| `config` | Bean wiring — Stripe, MinIO, Spring AI, Kubernetes, Redis, the plan-seeding `ApplicationRunner` | Live outside the service's component-scan root (a real historical bug — see `CLAUDE.md`) |
| `util` | Small, framework-free, directly unit-testable helpers | Depend on Spring, a repository, or anything not passed as a plain argument |

Each service's own additions:

- **`account-service`** — `security/` holds `LocalSessionAuthenticator` (it owns the `User`/`REVOKED_SESSION` tables), `SessionEvictionNotifier` and its own `WebSecurityConfig`; `service.impl` has `SessionServiceImpl`, `SubscriptionServiceImpl`, `StripePaymentProcessor` behind `PaymentProcessor`.
- **`workspace-service`** — `service.impl` also holds the preview pipeline: `PreviewDeploymentServiceImpl` (start/stop/restart, per-project locking), `PreviewRunnerPool` (claims a warm pod), `PreviewBootstrapper` (files → install → dev server), `PreviewRouter` (Redis routes), `PreviewLifecycle` + `PreviewReaper` (teardown, idle sweep); `ProjectTemplateServiceImpl` (starter files); `util/CodeSearchScanner`, `util/ProjectNameHeuristic`, `util/ProjectFilePath` (the one definition of a valid stored file path).
- **`intelligence-service`** — `llm/` holds the AI code-generation prompt/parser/tools/advisors, the code-insight prompts, teaching mode, and usage recording. It must never let `CodeInsightPrompts` (read-only) see the `<file>`/`<todo>`/`<learn>` write protocol. `service.impl` has `AiGenerationServiceImpl` (the build pipeline), `GenerationRegistry` (in-flight generations), `CodeInsightServiceImpl`, `IdeaServiceImpl`, `UsageServiceImpl`, `UsageInsightsServiceImpl`; `service/ProjectFileReader` is the read-only file view (§6).

Every service still authenticates its own requests rather than trusting the Gateway, but the machinery for doing so lives **once**, in `common-lib`'s `security` package, and is contributed to each service by `CommonLibAutoConfiguration`. A change to session or rate-limit behaviour is therefore made in one place.

Two services override part of it:

- **account-service** supplies its own `SessionAuthenticator` (it owns the `User` and `REVOKED_SESSION` tables and reads them directly, rather than calling an internal API) and its own `WebSecurityConfig` (it is the only service with public routes — the CSRF token, sign-in, sign-out, the plan catalogue and the Stripe webhook). Both are `@ConditionalOnMissingBean` in the auto-configuration, so defining them is all it takes.
- **workspace-service** and **intelligence-service** use the shared `ServiceSecurityConfig` unchanged, and keep only their own `SecurityExpressions` — the `@PreAuthorize` SpEL root, which differs because one reads a local membership table and the other asks over Feign.

## Frontend (`frontend/src/`)

| Directory | Owns | Must never |
|---|---|---|
| `pages/` | Top-level routed views (`ProjectView.tsx`, `ProjectsDashboard.tsx`, `BillingSettings.tsx`, …) | Hold logic that isn't specific to that page — extract to `lib/`/`hooks/` |
| `components/` | Feature components. `components/ui/` is the vendored shadcn/ui primitive set — Radix UI + Tailwind variants, treated as a library, not app code | Import app-specific state stores from `components/ui/` |
| `hooks/` | Custom React hooks — most wrap a `lib/` store or add React lifecycle around it | Contain business logic that doesn't need React (put that in `lib/`, test it there) |
| `lib/` | API client, SSE/stream parsing, module-level state stores (chat, code notes), and the framework-free logic most of the 281 frontend tests actually exercise | Import from `components/`/`pages/` (the dependency direction is one-way) |

**Module-level stores, not a global state library:** the streaming chat transcript (`lib/project-chat-store.ts`) and code-notes threads (`lib/code-lens-store.ts`) live in plain module-level maps rather than React context or a state library. This means they persist for the life of the *page*, not just a component's lifecycle — which is exactly why `lib/session.ts`'s `onSignOut(...)` registry exists: every such store must register a reset, or its contents survive a client-side route change after sign-out (see §6).
