# CLAUDE.md

Guidance for AI coding agents working in this repository. It exists so an agent can be productive without re-deriving context each session. Keep it short, and **update it in the same change whenever a convention, command or lesson changes** — a stale working agreement is worse than none.

## Project overview

VibeCraft is an AI-assisted project builder: a user describes an idea, answers a short AI-written interview, and gets a real project built through an AI chat — generated files are published to object storage as atomic revisions, a Kubernetes-backed live preview runs the result, and collaborators work together with per-project roles. Billing runs on Stripe with enforced daily-token, project and preview limits.

- **Two codebases, one repository:** a Spring Boot 4.1 (Java 25) backend and a React 18 + TypeScript SPA in `frontend/`. Several features (the streaming chat, sign-out data isolation, the live-preview panel) span both.
- **The backend is a set of microservices** in a multi-module Maven reactor: a Gateway in front of `account-service`, `workspace-service` and `intelligence-service`, each with its own database, plus `common-lib` and `discovery-service`. Don't assume which service owns a class, endpoint or table — check the docs below.

## Read before acting

These are authoritative and kept current:

| Need | Read |
|---|---|
| Services, module map, request flows, "where do I change X" | [`docs/architecture/`](docs/architecture/README.md) |
| Why the system is shaped as it is | [`docs/architecture/decisions/`](docs/architecture/decisions/README.md) |
| Security boundaries and where they're enforced | [`docs/architecture/security-model.md`](docs/architecture/security-model.md) |
| Entities, tables, enums, schema conventions | [`docs/schema/`](docs/schema/README.md) |
| Every endpoint, SSE formats, the error model | [`docs/api/`](docs/api/README.md) |
| Setup, configuration, live previews, troubleshooting | [`docs/local-development/`](docs/local-development/README.md) |
| Constraints, trade-offs, what isn't built yet | [`docs/known-gaps/`](docs/known-gaps/README.md) |
| Production topology, CI/CD, configuration | [`docs/deployment/`](docs/deployment/README.md) |
| Deploys, rollback, monitoring, backups | [`docs/operations/`](docs/operations/README.md) |

If a change would make any of these inaccurate, **update that doc in the same change**.

## Repository structure

```
pom.xml                 reactor parent — module list, shared dependencyManagement
common-lib/             shared error model, the session-auth kit, InternalServiceAuthFilter, Feign plumbing,
                        cross-service DTOs. NOT component-scanned: every bean is registered in
                        CommonLibAutoConfiguration, so a new one must be added there or it never exists.
discovery-service/      Eureka
gateway-service/        Spring Cloud Gateway — the browser's single origin. Ordered route table in application.yaml;
                        order is load-bearing (/api/projects/*/code/** → intelligence sits under /api/projects/**).
                        No catch-all: an unowned path is a 404. RoutingTableTest pins every path.
account-service/        users, plans, subscriptions, Stripe, sessions and their audit trail
workspace-service/      projects, members, files, file revisions, the live-preview pipeline
intelligence-service/   AI generation, code insight, idea clarifier, usage metering
  inside each service (com.vibecraft.<service>): entity/ enums/ repository/ mapper/ service/ service/impl/
  controller/ dto/ security/ feign/ config/ util/ (+ llm/ in intelligence); migrations in
  src/main/resources/db/migration/
frontend/src/           pages/ components/ hooks/ lib/ — logic lives in lib/
proxy/                  Node reverse proxy for preview hostnames
k8s/                    LOCAL DEV ONLY — the preview pipeline on kind while the backend runs via mvnw
deploy/k8s/             the production topology (Kustomize: base/ + overlays/kind, overlays/oracle; namespaces/)
deploy/scripts/         apply-secrets.sh, smoke-test.sh, restore-backup.sh, check-backup-freshness.sh
docker/                 the shared Java service Dockerfile (MODULE build-arg) and the preview-runner image
.github/workflows/      ci.yml (test → build 8 images → deploy → smoke test → rollback), uptime.yml
docs/                   documentation — start at docs/README.md
```

## Commands

```bash
./mvnw -pl common-lib,<service> test -Dtest=ClassName#method   # one test, building common-lib from source
./mvnw -pl gateway-service test -Dtest=RoutingTableTest        # rerun after any controller or route change
./mvnw -pl <service> spring-boot:run                           # prove a change boots (see local setup for ports)
./mvnw test                                                    # all backend tests (452; one needs Docker)
./mvnw clean package                                           # build every module
cd frontend && npx tsc --noEmit && npm run lint && npm test && npm run build
```

On Windows, use `mvnw.cmd`. A bare `./mvnw spring-boot:run` at the root fails — the root `pom.xml` has no main class. Running all five services on one machine needs a distinct `MANAGEMENT_SERVER_PORT` per service; see [setup](docs/local-development/setup.md).

Build and test as a reactor (`-pl common-lib,<service>`), never `-pl <service>` alone: every checkout on the machine shares one `~/.m2` `common-lib` SNAPSHOT jar.

## Practices

The following are imported in full.

@docs/practices/security-guardrails.md

@docs/practices/coding-conventions.md

@docs/practices/testing.md

@docs/practices/definition-of-done.md

## Known pitfalls

Silent-failure traps this stack has hit, imported in full. Check here first when something "should work" but doesn't.

@docs/practices/gotchas/spring-and-jpa.md

@docs/practices/gotchas/microservices-and-build.md

@docs/practices/gotchas/kubernetes.md

@docs/practices/gotchas/ci-and-tooling.md
