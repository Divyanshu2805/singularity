# Cross-Cutting Concerns

Concerns that span every service. Security has its own page: see the [security model](security-model.md).

## Streaming

Two server-sent-event formats exist, and they are **not** the same contract:

- `/api/chat/stream` sends JSON-wrapped `{ "text": ... }` events.
- The code-insight `/code/*/stream` endpoints send raw plain-text chunks, with different whitespace and multi-line rules.

Both send a `: keep-alive` comment every ~20 seconds of silence (`SseHeartbeat`), which keeps long generations alive through Cloudflare's idle-connection timeout. The Gateway passes streams through without buffering. Details: [streaming formats](../api/streaming.md).

## Errors

Every error response has one shape (`ApiError`), produced in one place: `common-lib`'s `GlobalExceptionHandler`. Business-logic failures throw an existing typed exception rather than a bare `RuntimeException`, so they map to a specific status. The two kinds of 503 — no free capacity, and a failed dependency — carry a `code` so clients can tell them apart. Full table: [error reference](../api/errors.md).

## Quotas and cost control

Plan limits (daily AI tokens, owned projects, concurrent previews) are enforced before any expensive work starts, as a `402` with a structured `quota` body. Every AI call path checks the caller's daily token budget first (`UsageService.assertWithinDailyTokenBudget`), so a user who is out of budget never pays for a partial attempt. Limits come from account-service; see [billing](../api/billing.md) and [usage](../api/usage.md).

## Schema ownership

Each service's schema is owned by its Flyway migrations (`db/migration/V1__init.sql`, then `V2…`), and Hibernate runs with `ddl-auto: validate`. Enum columns are plain `VARCHAR`s with no `CHECK` constraint, so adding an enum value needs no migration. See [ADR 0006](decisions/0006-flyway-owned-schemas.md) and [changing the schema](../schema/conventions.md#changing-the-schema).

## Configuration

- Every secret is an environment-variable placeholder in `application.yaml` with no committed default; a missing one fails startup.
- Locally, each service loads a repo-root `.env` file (`spring.config.import: optional:file:.env[.properties]`). The full list is in [configuration](../local-development/configuration.md).
- In production, non-secret settings come from the `app-config` ConfigMap and secrets from Kubernetes Secrets built on every deploy. See [deployment configuration](../deployment/configuration.md).

## Startup

Every service's `main()` calls `common-lib`'s `WindowsTimezoneWorkaround.apply()` before `SpringApplication.run(...)`. On Windows the JVM's default zone (`Asia/Calcutta`) is an alias PostgreSQL rejects on the first connection, and because it is a JVM default, each service must set it itself.

## Health checks

Every service exposes Spring Boot Actuator's `/actuator/health` on a separate management port (`9404` by default), never on its main port. It is unreachable through the Gateway or the public tunnel, answers without authentication, and exposes only `UP`/`DOWN` with no details. Kubernetes liveness and readiness probes target that port directly. See [health checks](../local-development/health-checks.md).

## Observability

- Logs go to standard output and are read with `kubectl logs`; there is no log shipping, distributed tracing or metrics pipeline.
- Every error response carries a random `requestId`, and `GlobalExceptionHandler` logs the full `ApiError` on every failure, so a user can quote one opaque value that matches a log line.
- SQL logging is on in each `application.yaml` for local development and off in the deployed manifests (`SPRING_JPA_SHOW_SQL=false`).
- The live deployment is watched by a scheduled uptime and backup-freshness workflow. See [monitoring](../operations/monitoring.md).

## Deployment topology

`deploy/k8s/` (Kustomize: `base/` plus `overlays/kind` and `overlays/oracle`) is the full-stack shape every service runs as in production:

- namespace `vibecraft` — Postgres, MinIO, the five Java services, the frontend, cloudflared, and the nightly backup CronJob;
- namespace `vibecraft-ai` — Redis, the preview proxy, and the untrusted runner-pod pool.

Every Java service Deployment sets `enableServiceLinks: false`, because Kubernetes' auto-injected `<SERVICE>_PORT` variables collide with each service's own port-override property. The runner pool's init container seeds each warm pod's `node_modules` from a pre-built image. See [Deployment](../deployment/README.md) and [Operations](../operations/README.md).
