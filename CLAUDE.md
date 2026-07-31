# CLAUDE.md

This is what an AI coding agent reads first when working in this repository. Its job is to make you productive immediately without re-deriving context every session. Keep it short enough to actually be read, and **update it in the same change whenever a convention, command, or hard-won lesson changes** — a stale working agreement is worse than none.

## Project Overview

VibeCraft is an AI-assisted project-building platform: a user describes an idea, answers a short AI-tailored interview about it, and gets a real project scaffolded and built through an AI chat conversation — generated files land in object storage, a live Kubernetes-backed preview shows the running result, and collaborators work on it together with role-based permissions. Billing runs on Stripe with enforced daily-token and project-count quotas.

**Two codebases, one repo:** a Spring Boot 4.1 (Java 25) backend, and a React 18 + TypeScript SPA in `frontend/`. Read `docs/architecture/` before assuming you know which one owns a given piece of behavior — several features (the streaming chat UI, the sign-out data-isolation fix, the live-preview panel) are genuinely split across both, with the file paths on each side named explicitly there.

**The backend is a set of microservices** — a multi-module Maven reactor, not a single `pom.xml` at the repo root. Traffic runs Gateway → `account-service` / `workspace-service` / `intelligence-service` (each with its own database), with `common-lib` and `discovery-service` around them. **Read `docs/architecture/` before assuming which service owns a class, endpoint, or table** — it, `docs/schema/`, and `docs/api/` describe the system as it is now.

**Stage:** actively developed, not yet launched. Every backend service is implemented (no stubs remain) as of the last full audit; open gaps and deferred work are tracked in `TODO.md`, not here.

## Read Before Acting

Don't guess at structure or reconstruct decisions from scratch — these are authoritative and kept current:

| Need | Read |
|---|---|
| Module map, request flows with real file paths, "where do I change X" | [`docs/architecture/`](docs/architecture/README.md) |
| Entities, relationships, enum/schema conventions | [`docs/schema/`](docs/schema/README.md) |
| Every endpoint, request/response shapes, SSE stream formats, error taxonomy | [`docs/api/`](docs/api/README.md) |
| Setup, running live previews locally, troubleshooting | [`docs/local-development/`](docs/local-development/README.md) |
| Known gaps, deferred features, open product/design questions | [`TODO.md`](TODO.md) *(local, gitignored — not on GitHub)* |

If a change you're making would make any of the four tracked docs above inaccurate, **update that doc in the same change**. Don't leave it for later — "later" is how the previous docs on this project drifted enough to need this rewrite.

## Tech Stack

→ [`docs/tech-stack.md`](docs/tech-stack.md)

@docs/tech-stack.md

## Repository Structure

Multi-module Maven reactor:

```
pom.xml                     reactor parent (packaging=pom) — module list, shared dependencyManagement
common-lib/                 shared: the whole session-auth kit (SessionAuthFilter, SessionCache,
                             SessionCookies, RateLimiter, UserPrincipal, AuthUtil, FirebaseIdentityVerifier,
                             RemoteSessionAuthenticator, InternalSessionController, ServiceSecurityConfig),
                             InternalServiceAuthFilter + FeignClientInterceptor + AccountServiceClient,
                             ApiError/exception taxonomy, ClockConfig/AsyncConfig/FirebaseConfig/Hashing.
                             All of it registered by CommonLibAutoConfiguration - these classes are NOT
                             component-scanned, so a new one must be added there or it never exists.
                             Depended on by account-service, workspace-service, intelligence-service.
discovery-service/          Eureka server
gateway-service/            Spring Cloud Gateway (reactive — non-blocking, doesn't buffer SSE streams).
                             The browser's single origin. Transparent passthrough (no auth logic of its
                             own) with an ordered route table sending each URL to the service that owns
                             it — see its application.yaml, and RoutingTableTest, which pins every path.
                             Route ORDER is load-bearing: /api/projects/{id}/code/** (intelligence) sits
                             under /api/projects/** (workspace). There is no catch-all route: a path
                             nothing owns is a 404 from the Gateway.
account-service/            Users, Plans, Subscriptions, Stripe billing, the auth audit trail — its own
                             DB, its own full Firebase/session/CSRF chain (not delegated to gateway-
                             service). Owns /api/auth/**, /api/plans, /api/me/**, /api/payments/**,
                             /webhooks/payment.
workspace-service/          Project/ProjectMember/ProjectFile/Preview/PreviewSession, the K8s/MinIO/
                             Redis live-preview pipeline — its own DB, its own full security chain,
                             calls account-service via Feign for anything User/Plan-shaped. Owns
                             /api/projects/** (except .../code/**) and /api/previews.
intelligence-service/       ChatSession/ChatMessage/ChatEvent/CodeNote/UsageEvent/UsageLog, the AI-
                             generation/code-insight/idea/usage pipeline — its own DB, its own full
                             security chain, calls account-service and workspace-service via Feign for
                             anything User/Project-shaped. Owns /api/chat/**, /api/ideas/**,
                             /api/usage/**, /api/projects/{id}/code/**.
infra/postgres-init/        creates each service's database on a brand-new Postgres volume
  Inside each domain service — src/main/java/com/vibecraft/<account|workspace|intelligence>/:
    entity/, enums/          JPA schema — see docs/schema/ (the schema itself is owned by
                             src/main/resources/db/migration/, Flyway; Hibernate only validates)
    repository/               Spring Data JPA interfaces
    mapper/                   MapStruct entity<->DTO conversion
    service/, service/impl/   business logic — controllers never skip this layer
    controller/                REST endpoints, plus Internal*Controller under /internal/v1
    dto/                       request/response records, one subpackage per domain
    security/                  only what can't be shared: SecurityExpressions (the @PreAuthorize SpEL root)
                             in workspace/intelligence, and account's own WebSecurityConfig +
                             LocalSessionAuthenticator + SessionEvictionNotifier. The rest is common-lib's.
    feign/                     clients for the other services' internal APIs (workspace, intelligence)
    llm/                       (intelligence-service) AI prompts, parsing, tools, advisors, usage recording
    config/                    bean wiring (Stripe, MinIO, Spring AI, Kubernetes, Redis)
    util/                      small, framework-free, directly-testable helpers
  src/main/resources/application.yaml   configuration — every secret is an env-var placeholder, no fallback
frontend/src/
  pages/, components/, hooks/, lib/   see docs/architecture/'s module map for the boundary between these
k8s/                        Kubernetes manifests for the live-preview runner pool + proxy
proxy/                      standalone Node reverse proxy (routes preview hostnames via Redis)
docs/                       architecture, data model, API reference, local dev
TODO.md                     local working reference of known gaps — gitignored, not pushed
```

Full per-module ownership and a "where do I change X" table: `docs/architecture/`.

## Commands

```bash
./mvnw -pl discovery-service spring-boot:run             # Eureka — start first
./mvnw -pl account-service spring-boot:run                # :8081
./mvnw -pl workspace-service spring-boot:run               # :8082
./mvnw -pl intelligence-service spring-boot:run            # :8083
./mvnw -pl gateway-service spring-boot:run                 # LAST — the browser's origin (:8000); resolves the three services from Eureka
./mvnw -pl gateway-service test -Dtest=RoutingTableTest    # the URL → service table; rerun after any controller/route change
./mvnw -pl <module> test -Dtest=ClassName                  # one test class (works for any module)
./mvnw -pl <module> test -Dtest=ClassName#methodName       # one test method
./mvnw clean package                                       # build every module's jar
./mvnw test                                                # every module's tests (132) — no database or cluster needed
```

On Windows, `mvnw.cmd` in place of `./mvnw`. A bare `./mvnw spring-boot:run` (no `-pl`) fails — the reactor's root `pom.xml` is an aggregator with no main class.

A bare `./mvnw test` passes: the service tests are plain JUnit (no Spring context, so the Windows-timezone problem in `docs/local-development/troubleshooting.md`'s troubleshooting table can't bite), and the Gateway's route-table test needs no database. Still build and test as a reactor (`-pl common-lib,<service>`), not `-pl <service>` alone — see the shared `~/.m2` jar gotcha below.

```bash
cd frontend
npm run dev      # dev server, :5173
npm run build    # production build
npm test         # vitest, 281 tests
npx tsc --noEmit # typecheck only
```

Full setup, service URLs, and live-preview cluster requirements: `docs/local-development/`.

## Coding Conventions

→ [`docs/practices/conventions.md`](docs/practices/conventions.md)

@docs/practices/conventions.md

## Hard-Won Gotchas (read before you hit them yourself)

→ [`docs/practices/gotchas.md`](docs/practices/gotchas.md)

@docs/practices/gotchas.md

## Security & Guardrails (do not bypass)

→ [`docs/practices/security.md`](docs/practices/security.md)

@docs/practices/security.md

## Testing Expectations

→ [`docs/practices/testing.md`](docs/practices/testing.md)

@docs/practices/testing.md

## Things to Avoid

→ [`docs/practices/things-to-avoid.md`](docs/practices/things-to-avoid.md)

@docs/practices/things-to-avoid.md

## Definition of Done

→ [`docs/practices/definition-of-done.md`](docs/practices/definition-of-done.md)

@docs/practices/definition-of-done.md
