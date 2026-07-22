# Where things stand (after Phase 4, 2026-07-19)

The browser's traffic now goes **Gateway (`:8000`) → account-service / workspace-service / intelligence-service**, resolved through Eureka. `legacy-monolith` is switched off and receives nothing; it stays in the tree, unmodified, as the rollback target until a later, separate step deletes it. Every phase entry below is the record of how each piece got here; **Phase 4 is where the traffic actually moved**.

| URL prefix | Owner |
|---|---|
| `/api/auth/**`, `/api/plans`, `/api/me/**`, `/api/payments/**`, `/webhooks/payment` | `account-service` (`:8081`) |
| `/api/projects/**` (files, members, preview, deploy, fork, pin/star…), `/api/previews` | `workspace-service` (`:8082`) |
| `/api/chat/**`, `/api/ideas/**`, `/api/usage/**`, `/api/projects/{id}/code/**` | `intelligence-service` (`:8083`) |
| everything else (incl. `/internal/**`) | the fallback → `legacy-monolith`, which is off — so it answers a 5xx |

**Phase 5 (2026-08-11)** rewrote `docs/architecture/`, `docs/schema/` and `docs/api/` for the split — checked against the controllers, entities, Flyway migrations and configs rather than adapted from the monolith's text — and corrected the pre-cutover wording left in code comments. Remaining work: delete `legacy-monolith` (its own step).
