# Where things stand (after Phase 5 and the removal of the monolith, 2026-08-11)

The browser's traffic goes **Gateway (`:8000`) → account-service / workspace-service / intelligence-service**, resolved through Eureka. The original monolith (`legacy-monolith`) has been **removed** — it was switched off at the cutover on 2026-07-19 and deleted, with its Gateway fallback and rollback profile, once the new stack had been used and tested signed-in. Every phase entry below is the record of how each piece got here; **Phase 4 is where the traffic actually moved**.

| URL prefix | Owner |
|---|---|
| `/api/auth/**`, `/api/plans`, `/api/me/**`, `/api/payments/**`, `/webhooks/payment` | `account-service` (`:8081`) |
| `/api/projects/**` (files, members, preview, deploy, fork, pin/star…), `/api/previews` | `workspace-service` (`:8082`) |
| `/api/chat/**`, `/api/ideas/**`, `/api/usage/**`, `/api/projects/{id}/code/**` | `intelligence-service` (`:8083`) |
| everything else (incl. `/internal/**`) | no route — a 404 from the Gateway itself (there is no catch-all) |

**Phase 5 (2026-08-11)** rewrote `docs/architecture/`, `docs/schema/` and `docs/api/` for the split — checked against the controllers, entities, Flyway migrations and configs rather than adapted from the monolith's text — and corrected the pre-cutover wording left in code comments. Remaining work: delete `legacy-monolith` (its own step).
