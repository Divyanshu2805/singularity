# Constraints and Trade-offs

Structural limits of the current design. None of them is a problem at today's scale; each one shapes *how* the system would have to change to grow.

## Some state is per process, not per system

Each service keeps its own `SessionCache` and `RateLimiter` counters; workspace-service keeps the per-project preview lock; intelligence-service keeps the registry of running generations. With one instance of each service, that is correct. As soon as a service runs more than one instance:

- a user's rate-limit budget is multiplied by the instance count;
- a sign-out eviction reaches only the instances Eureka lists (each cache still expires on its own within 60 seconds);
- the preview lock no longer serializes starts and stops — it would need a distributed lock, such as Redis `SET NX`;
- a running generation can only be re-attached on the instance running it.

## Consistency across services is best-effort

There are no cross-database transactions and no foreign keys across services. A project deleted in workspace-service leaves its chat and usage rows in intelligence-service (usage insights read deleted projects on purpose), and a crash between two services' writes can leave one ahead of the other. Where it matters, writes are ordered so the failure is benign — for example, the sign-out eviction runs only after the revocation is recorded.

## CORS is intentionally not configured

The browser only ever talks to one origin: the Gateway in production, and the Vite dev server in development (which proxies `/api` and strips `Origin`). No service configures CORS. If the frontend were ever served from a different origin than the API, the right place for it would be a single `globalcors` rule on the Gateway, not per-service configuration.

## Previews are single-stack

Live previews support React + Vite projects. The pod pool, bootstrapper and routing are almost entirely stack-agnostic; only the runner image, the start-up script, the readiness probe (`/@vite/client`) and the port are specific to Vite. Supporting another stack is a change to those four pieces, not to the pipeline.

## One machine in production

Everything runs on a single node. Losing it means restoring from the nightly backup onto a new machine (about 1–2 hours), and preview start-ups compete with the services for two CPU cores. See [risks and growth](../deployment/risks-and-growth.md).

## The highest-risk paths are verified by hand

The live-preview pipeline and Stripe billing have no end-to-end automated tests; both are verified manually against real infrastructure. See [testing](../practices/testing.md#what-automated-tests-dont-cover).
