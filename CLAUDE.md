# CLAUDE.md

This is what an AI coding agent reads first when working in this repository. Its job is to make you productive immediately without re-deriving context every session. Keep it short enough to actually be read, and **update it in the same change whenever a convention, command, or hard-won lesson changes** — a stale working agreement is worse than none.

## Project Overview

VibeCraft is an AI-assisted project-building platform: a user describes an idea, answers a short AI-tailored interview about it, and gets a real project scaffolded and built through an AI chat conversation — generated files land in object storage, a live Kubernetes-backed preview shows the running result, and collaborators work on it together with role-based permissions. Billing runs on Stripe with enforced daily-token and project-count quotas.

**Two codebases, one repo:** a Spring Boot 4.1 (Java 25) backend, and a React 18 + TypeScript SPA in `frontend/`. Read `docs/architecture/` before assuming you know which one owns a given piece of behavior — several features (the streaming chat UI, the sign-out data-isolation fix, the live-preview panel) are genuinely split across both, with the file paths on each side named explicitly there.

**The backend is mid-migration from a monolith to microservices** — a multi-module Maven reactor now, not a single `pom.xml` at the repo root. `legacy-monolith/` is the original backend, unmodified except for its new location, still the source of truth for every domain not yet extracted; `common-lib`, `discovery-service`, and `gateway-service` are the new scaffolding in front of and around it. **Read `docs/migration/` before assuming a class, endpoint, or table still lives where an older doc or your own memory says it does** — it's the running record of what's moved, where, and why, updated in the same change as every migration phase.

**Stage:** actively developed, not yet launched. Every backend service is implemented (no stubs remain) as of the last full audit; open gaps and deferred work are tracked in `TODO.md`, not here. The microservices migration is tracked in `docs/migration/` (moves so far) and a plan doc outside the repo (phase design and reliability strategy) — this is a separate, ongoing effort layered on top of the audited-complete backend, not a sign that something regressed.

## Read Before Acting

Don't guess at structure or reconstruct decisions from scratch — these are authoritative and kept current:

| Need | Read |
|---|---|
| Module map, request flows with real file paths, "where do I change X" | [`docs/architecture/`](docs/architecture/README.md) |
| Entities, relationships, enum/schema conventions | [`docs/schema/`](docs/schema/README.md) |
| Every endpoint, request/response shapes, SSE stream formats, error taxonomy | [`docs/api/`](docs/api/README.md) |
| Setup, running live previews locally, troubleshooting | [`docs/local-development/`](docs/local-development/README.md) |
| **What's moved to a microservice already, what's still in `legacy-monolith/`** | [`docs/migration/`](docs/migration/README.md) |
| Known gaps, deferred features, open product/design questions | [`TODO.md`](TODO.md) *(local, gitignored — not on GitHub)* |

If a change you're making would make any of the four tracked docs above inaccurate, **update that doc in the same change**. Don't leave it for later — "later" is how the previous docs on this project drifted enough to need this rewrite.

## Tech Stack

→ [`docs/tech-stack.md`](docs/tech-stack.md)

@docs/tech-stack.md

## Repository Structure

Multi-module Maven reactor, mid-migration to microservices (`docs/migration/` has the moves so far):

```
pom.xml                     reactor parent (packaging=pom) — module list, shared dependencyManagement
common-lib/                 shared: internal-JWT issue/verify, JwtAuthFilter, FeignClientInterceptor,
                             ApiError/exception taxonomy, ClockConfig/AsyncConfig/Hashing. Nothing
                             depends on it yet — wired in starting Phase 1.
discovery-service/          Eureka server
gateway-service/            Spring Cloud Gateway (reactive — non-blocking, doesn't buffer SSE streams).
                             The browser's single origin. Transparent passthrough until a domain is
                             actually extracted — see its application.yaml's routing config.
legacy-monolith/            the original backend, unmodified except for its new location — still the
                             source of truth for every domain not yet extracted:
  src/main/java/com/java/vibecraft/
    entity/, enums/          JPA schema — see docs/schema/
    repository/               Spring Data JPA interfaces
    mapper/                   MapStruct entity<->DTO conversion
    service/, service/impl/   business logic — controllers never skip this layer
    controller/                REST endpoints
    dto/                       request/response records, one subpackage per domain
    security/                  session/JWT auth, rate limiting, @PreAuthorize SpEL root
    error/                     ApiError, typed exceptions, GlobalExceptionHandler
    llm/                       AI prompts, response parsing, tools, advisors, usage recording
    config/                    bean wiring (Stripe, MinIO, Spring AI, Kubernetes, Redis, Firebase, CORS)
    util/                      small, framework-free, directly-testable helpers
  src/main/resources/application.yaml   configuration — every secret is an env-var placeholder, no fallback
frontend/src/
  pages/, components/, hooks/, lib/   see docs/architecture/'s module map for the boundary between these
k8s/                        Kubernetes manifests for the live-preview runner pool + proxy
proxy/                      standalone Node reverse proxy (routes preview hostnames via Redis)
docs/                       architecture, data model, API reference, local dev, migration map
TODO.md                     local working reference of known gaps — gitignored, not pushed
```

Full per-module ownership and a "where do I change X" table: `docs/architecture/`. What's moved out of `legacy-monolith/` so far: `docs/migration/`.

## Commands

```bash
./mvnw -pl legacy-monolith spring-boot:run              # run the backend — goes through main(), verifies it actually boots
./mvnw -pl legacy-monolith test -Dtest=ClassName        # run one test class
./mvnw -pl legacy-monolith test -Dtest=ClassName#methodName   # run one test method
./mvnw clean package                                     # build every module's jar
./mvnw -pl discovery-service spring-boot:run             # Eureka — start before gateway-service
./mvnw -pl gateway-service spring-boot:run                # the browser's actual origin now — see docs/local-development/
```

On Windows, `mvnw.cmd` in place of `./mvnw`. A bare `./mvnw spring-boot:run` (no `-pl`) fails — the reactor's root `pom.xml` is an aggregator with no main class.

**A bare `./mvnw test` does not currently pass** (a Windows-timezone issue that predates most of this codebase — see `docs/local-development/troubleshooting.md`'s troubleshooting table for the exact cause and the workaround). Run named test classes; don't assume a red bare `test` run means your change broke something until you've run the actual suite listed there.

```bash
cd frontend
npm run dev      # dev server, :5173
npm run build    # production build
npm test         # vitest, 270 tests
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
