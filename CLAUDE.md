# CLAUDE.md

Guidance for AI coding agents working in this repository. It exists so an agent can be productive without re-deriving context each session. Keep it short, and **update it in the same change whenever a convention, command or lesson changes** — a stale working agreement is worse than none.

## Project overview

Singularity is an AI-assisted project builder: a user describes an idea, answers a short AI-written interview, and gets a real project built through an AI chat — generated files are published to object storage as atomic revisions, a Kubernetes-backed live preview runs the result, the owner can publish it at a public link anyone can open (a production build made in a runner pod and served from storage by the preview proxy), and collaborators work together with per-project roles. Billing runs on Stripe with enforced daily-token, project and preview limits.

- **Two codebases, one repository:** a Spring Boot 4.1 (Java 25) backend and a React 18 + TypeScript SPA in `frontend/`. Several features (the streaming chat, sign-out data isolation, the live-preview panel) span both.
- **The backend is a set of microservices** in a multi-module Maven reactor: a Gateway in front of `account-service`, `workspace-service` and `intelligence-service`, each with its own database, plus `common-lib` and `discovery-service`. Don't assume which service owns a class, endpoint or table — check the docs below.

## Read before acting

These are authoritative and kept current:

| Need | Read |
|---|---|
| Services, request flows, revisions, previews, publishing, security, key decisions | [`docs/architecture.md`](docs/architecture.md) |
| Tables per service, schema conventions | [`docs/data-model.md`](docs/data-model.md) |
| Every endpoint, the chat stream, the error model, the internal API | [`docs/api.md`](docs/api.md) |
| Setup, configuration, live previews, tests, troubleshooting | [`docs/development.md`](docs/development.md) |
| Production topology, CI/CD, secrets, operations, capacity | [`docs/deployment.md`](docs/deployment.md) |
| Measured numbers | [`docs/results.md`](docs/results.md) |
| Every build-benchmark run | [`.claude/practices/build-benchmark-results.md`](.claude/practices/build-benchmark-results.md) |

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
workspace-service/      projects, members, files, file revisions, the live-preview pipeline, publishing
intelligence-service/   AI generation, code insight, idea clarifier, usage metering, the build benchmark
  inside each service (com.singularity.<service>): entity/ enums/ repository/ mapper/ service/ service/impl/
  controller/ dto/ security/ feign/ config/ util/ (+ llm/ in intelligence); migrations in
  src/main/resources/db/migration/
frontend/src/           pages/ components/ hooks/ lib/ — logic lives in lib/
proxy/                  Node reverse proxy for preview hostnames; also serves published apps from storage (published*.js, s3.js)
e2e/                    the browser journey test (Playwright) and what it stands on: stack.sh starts the whole
                        application on ports of its own with the scripted model and the Firebase Auth emulator;
                        load.mjs, throughput.mjs, lighthouse.mjs and real/ are measurements, run only when asked for
k8s/                    LOCAL DEV ONLY — the preview pipeline on kind while the backend runs via mvnw;
                        preview-test-cluster.sh stands a second one up in its own namespace for PreviewPipelineIT
deploy/k8s/             the production topology (Kustomize: base/ + overlays/kind, overlays/oracle; namespaces/;
                        network-policies/ - applied by hand, not by CI)
deploy/scripts/         apply-secrets.sh, deploy-revisions.sh, smoke-test.sh, restore-backup.sh, check-backup-freshness.sh,
                        check-network-policies.sh (proves deploy/k8s/network-policies on a throwaway kind cluster)
docker/                 the shared Java service Dockerfile (MODULE build-arg) and the preview-runner image
.github/workflows/      ci.yml (test, incl. a real preview and the browser journey on kind → build 8 images → deploy → smoke test → rollback), uptime.yml
scripts/                bench-verify.sh - compiles a build benchmark's projects in a throwaway container and starts the
                        ones that have a server; starter-launcher.test.mjs - tests the template's start.mjs;
                        coverage-summary.sh - the backend's coverage per module, after `./mvnw verify`
docs/                   documentation — start at docs/README.md; the working notes CLAUDE.md imports are in .claude/practices/
```

## Commands

```bash
./mvnw -pl common-lib,<service> test -Dtest=ClassName#method   # one test, building common-lib from source
./mvnw -pl gateway-service test -Dtest=RoutingTableTest        # rerun after any controller or route change
./mvnw -pl <service> spring-boot:run                           # prove a change boots (see local setup for ports)
./mvnw test                                                    # all backend tests (1,623; one needs Docker)
./mvnw verify                                                  # the same, and each module held to its coverage floor (what CI runs)
./mvnw clean package                                           # build every module
cd frontend && npx tsc --noEmit -p tsconfig.app.json && npm run lint && npm run coverage && npm run build
./mvnw -pl common-lib,intelligence-service compile spring-boot:run -Dspring-boot.run.profiles=stub-ai   # no AI provider, no tokens
k8s/preview-test-cluster.sh --context kind-singularity && ./mvnw -pl common-lib,workspace-service test -Dtest=PreviewPipelineIT -Dsurefire.failIfNoSpecifiedTests=false   # a real preview on kind; after any preview or proxy change
./mvnw -pl common-lib,workspace-service test -Dtest=PublishPipelineIT -Dsurefire.failIfNoSpecifiedTests=false   # a real publish on that cluster; after any publishing or proxy change
cd proxy && node --test                                         # the preview proxy and the published-app server
```

```bash
./mvnw -DskipTests package && e2e/stack.sh up --context kind-singularity && (cd e2e && npm test); e2e/stack.sh down --context kind-singularity   # the browser journey; after a change that crosses services, or touches sign-in, chat, preview or lessons
```

On Windows, use `mvnw.cmd`. A bare `./mvnw spring-boot:run` at the root fails — the root `pom.xml` has no main class. Running all five services on one machine needs a distinct `MANAGEMENT_SERVER_PORT` per service; see [development](docs/development.md).

Build and test as a reactor (`-pl common-lib,<service>`), never `-pl <service>` alone: every checkout on the machine shares one `~/.m2` `common-lib` SNAPSHOT jar.

## Practices

The following are imported in full.

@.claude/practices/security-guardrails.md

@.claude/practices/coding-conventions.md

@.claude/practices/testing.md

@.claude/practices/definition-of-done.md

## Known pitfalls

Silent-failure traps this stack has hit, imported in full. Check here first when something "should work" but doesn't.

@.claude/practices/gotchas/spring-and-jpa.md

@.claude/practices/gotchas/microservices-and-build.md

@.claude/practices/gotchas/kubernetes.md

@.claude/practices/gotchas/ci-and-tooling.md

@.claude/practices/gotchas/ai-generation.md
