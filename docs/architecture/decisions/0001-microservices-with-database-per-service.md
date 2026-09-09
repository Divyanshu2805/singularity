# 0001. Microservices with a database per service

**Status:** Accepted

## Context

VibeCraft began as a single Spring Boot application with one database. Its concerns grew along three clearly separate lines: identity and billing, projects and their live previews, and AI generation with usage metering. They change at different rates, have different external dependencies (Stripe; Kubernetes and MinIO; OpenRouter), and fail in different ways. In a single deployable, a slow AI provider or a stuck preview cluster could degrade sign-in and billing.

## Decision

Split the backend into three domain services — `account-service`, `workspace-service` and `intelligence-service` — behind a Spring Cloud Gateway, with Eureka for discovery and a shared `common-lib` for the error shape, session authentication and internal-call plumbing.

Each service owns its own PostgreSQL database and schema. A service never reads another service's tables; it asks the owner over a private `/internal/v1` API authenticated by a shared secret. The Gateway is a transparent router with no authentication logic, and every service authenticates its own requests.

The monolith was migrated in phases — scaffold the reactor, extract each service standalone, cut traffic over behind the Gateway, then remove the monolith.

## Consequences

- A failure in one domain's dependencies stays contained to that domain's endpoints.
- References across services are plain id columns, never foreign keys, so a dangling id is possible and must be tolerated (usage rows deliberately outlive their project).
- There are no cross-service transactions. Where two services must both change, the writes are ordered so the failure mode is benign.
- Some state is per process (session caches, rate-limit counters, the preview lock, in-flight generations). This is correct with one instance per service and needs a shared store before any service is scaled horizontally. See [known constraints](../../known-gaps/constraints-and-trade-offs.md).
- Local development runs six processes instead of one.
