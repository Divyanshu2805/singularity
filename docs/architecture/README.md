# Architecture

Singularity is a React app in front of a set of Spring Boot services. The browser only ever talks to the Gateway, and the Gateway forwards each path to the one service that owns it. Generated code never runs on any of these services. It runs in Kubernetes pods behind a small Node proxy.

```
browser ──► Gateway (:8000) ──┬──► account-service      (:8081)  ── account DB
                              ├──► workspace-service    (:8082)  ── workspace DB, MinIO, Redis, Kubernetes
                              └──► intelligence-service (:8083)  ── intelligence DB, model provider

preview / published app hostnames ──► preview proxy (Node) ──► runner pods / MinIO
```

## Services

| Service | Port | Owns | Database |
|---|---|---|---|
| `gateway-service` | 8000 | The ordered route table. No auth logic of its own. It's reactive, so SSE streams pass through without buffering | — |
| `discovery-service` | 8761 | Eureka. Services call each other by name (`lb://account-service`) | — |
| `account-service` | 8081 | Users, plans, subscriptions, Stripe, sessions and their audit trail. `/api/auth/**`, `/api/plans`, `/api/me/**`, `/api/payments/**`, `/webhooks/payment` | `singularity-account-db` |
| `workspace-service` | 8082 | Projects, members, files, revisions, the live-preview pipeline and publishing. `/api/projects/**` (except `.../code/**`), `/api/previews/**`, `/api/public/**`, `/api/github/**` | `singularity-workspace-db` |
| `intelligence-service` | 8083 | The build chat, code insight and lessons, the idea interview, usage metering. `/api/chat/**`, `/api/ideas/**`, `/api/usage/**`, `/api/projects/{id}/code/**` | `singularity-intelligence-db` |
| `common-lib` | — | Not a service. The error shape, the session-auth kit, internal-call plumbing and shared DTOs | — |

The three databases share one Postgres server, but a service never reads another service's tables. If it needs something from another domain, it asks over that service's internal API ([service communication](service-communication.md)).

## External systems

| System | Used for | Where |
|---|---|---|
| PostgreSQL | One database per service. Flyway owns every schema | all three services |
| Firebase Auth | Every sign-in method. account-service swaps a Firebase ID token for a session cookie, and each service verifies the cookie itself. No password reaches the backend | account (mints), all (verify) |
| MinIO | File contents, revision blobs and published builds. The database only keeps metadata | workspace, proxy |
| Model provider | Every AI call, through Spring AI against an OpenAI-compatible API. Production uses Gemini (`gemini-3.8-flash` for builds, `gemini-3.5-flash-lite` for the rest) | intelligence |
| Stripe | Subscriptions, checkout, the customer portal and webhooks | account |
| Kubernetes + Redis | Runner pods for previews and publish builds, and the hostname → pod routes | workspace, proxy |

## Words worth knowing

| Name | What it is |
|---|---|
| `Project` | The thing being built. It has no owner column: ownership is a `ProjectMember` row with role `OWNER` |
| `ProjectMember` | A user's role on one project: `OWNER`, `EDITOR` or `VIEWER`. There are no platform-wide roles |
| `ProjectFile` | File metadata. The bytes live in MinIO under a key built by `ProjectFilePath` |
| Revision | One atomic, immutable set of file changes. Every AI turn, restore and undo publishes one ([file revisions](file-revisions.md)) |
| `Preview` / `PreviewSession` | A `Preview` is the one runner pod a project shares. A `PreviewSession` is one collaborator watching it, so one person stopping doesn't kill it for everyone |
| `ChatEvent` | One thing the AI did in a turn: a message, a checklist step, a file write or edit, a lesson, a question, or how the turn ended |
| `UsageLog` / `UsageEvent` | A per-user daily counter (checked on every call) and an append-only ledger (for the usage page), written in the same transaction |
| `ProjectFileReader` | The read-only view of a project's files that code insight is typed against, so it can't grow a write path by accident |
| Plan | A billing tier with limits on owned projects, daily tokens, concurrent previews and published apps |

## Things that apply everywhere

- **Errors.** Every error has one JSON shape (`ApiError`), built by `common-lib`'s `GlobalExceptionHandler`, with a `requestId` that matches a log line. See [errors](../api/errors.md).
- **Streaming.** Two SSE formats: the chat stream sends JSON events, and the code-insight streams send plain text. Both send a keep-alive comment every ~20 s so Cloudflare doesn't drop long builds. See [streaming](../api/streaming.md).
- **Quotas.** Plan limits are checked before any expensive work, and a breach answers `402` with a `quota` body. AI calls reserve part of the day's allowance while they run, and a build is stopped mid-turn if the allowance runs out ([the daily allowance](flows/ai-generation.md#the-daily-allowance)).
- **Schemas.** Flyway migrations own every schema, and Hibernate only validates. Enum columns are plain `VARCHAR` with no `CHECK` constraint ([ADR 0006](decisions/0006-flyway-owned-schemas.md)).
- **Config.** Every secret is an env-var placeholder with no default, so a missing one fails startup. Locally they come from the repo-root `.env`. In production they come from a ConfigMap and Secrets ([deployment configuration](../deployment/configuration.md)).
- **Health.** Actuator health is on a separate management port (`9404` by default) that the Gateway and tunnel never route. It only reports `UP`/`DOWN`.
- **Logs.** Logs go to stdout and are read with `kubectl logs`. There's no tracing or metrics pipeline. The live site is watched by a scheduled uptime workflow ([monitoring](../operations/monitoring.md)).
- **Windows.** Every service's `main()` calls `WindowsTimezoneWorkaround.apply()`, because Postgres rejects the JVM's default `Asia/Calcutta` zone.

## Stack

| | |
|---|---|
| Backend | Java 25, Spring Boot 4.1, Spring Cloud 2025.1 (Gateway, Eureka, OpenFeign), Spring AI 2.0, Lombok, MapStruct, Maven reactor |
| Data | PostgreSQL 18, Flyway, MinIO (Java SDK 8.6), Redis |
| Integrations | Firebase Admin 9.10, Stripe Java 31.1, fabric8 `kubernetes-client` 6.13.4 |
| Frontend | React 18, TypeScript 5.8, Vite 5, Tailwind and shadcn/ui, TanStack Query 5, React Router 6, CodeMirror 6, Recharts |
| Preview proxy | Node, `http-proxy`, `ioredis`, tested with `node:test` |
| Infra | kind locally, k3s in production, Kustomize, GitHub Actions and GHCR, Cloudflare (DNS, Tunnel, R2), Tailscale |
| Testing | JUnit 5, Mockito, Testcontainers, Vitest and Testing Library, Playwright, Lighthouse |

## Read next

1. [Module map](module-map.md): what lives in each module, and the layering rules inside a service
2. [Service communication](service-communication.md): the Gateway's route table and the internal API
3. Request flows: [authentication](flows/authentication.md), [AI generation](flows/ai-generation.md), [live preview](flows/live-preview.md), [publishing](flows/publishing.md)
4. [File revisions](file-revisions.md) and the [security model](security-model.md)
5. [Where do I change…?](where-to-change.md): a task-first index into the code
6. [Decision records](decisions/README.md): why it's shaped this way

The production topology is in [deployment](../deployment/README.md).
