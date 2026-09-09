# Testing

## Test suites

| Suite | Command | Size | Needs |
|---|---|---|---|
| Backend (all modules) | `./mvnw test` | 452 tests — common-lib 24, gateway 66, account 32, workspace 205, intelligence 125 | Docker, for one integration test (below) |
| Frontend | `cd frontend && npm test` | 298 tests in 29 files (Vitest) | — |
| Preview proxy | `cd proxy && node --test` | Access-token and routing tests | — |

Run the tests you changed by name while iterating:

```bash
./mvnw -pl common-lib,workspace-service test -Dtest=ClassName          # one class
./mvnw -pl common-lib,workspace-service test -Dtest=ClassName#method   # one method
```

Include `common-lib` in the `-pl` list so it is built from source rather than resolved from the shared `~/.m2` jar (see [pitfalls](gotchas/microservices-and-build.md#shared-common-lib-snapshot-jar)).

## Backend

- **Plain JUnit by default.** Business logic is tested without a Spring context wherever possible: tests construct the class under test directly and mock its collaborators (repositories, `MinioClient`, Feign clients). They need no database or cluster, and they sidestep the Windows time-zone problem a Spring-context test would hit.
- **Slice tests where the wiring is the point.** Each domain service has one `@WebMvcTest` that drives requests through the real security filter chain (`FullChainAccountAccessTest`, `FullChainFileAccessTest`, `FullChainChatAccessTest`). The Gateway's `RoutingTableTest` is a `@SpringBootTest` that needs no database.
- **One real-infrastructure test.** `RevisionPublisherIntegrationTest` (workspace-service) uses Testcontainers with real PostgreSQL and MinIO, because it asserts things a mock can't prove: that a failed publish really rolled back, and that concurrent publishes really serialize to one winner. It uses a `@DataJpaTest` slice with `@AutoConfigureTestDatabase(replace = NONE)` and calls `WindowsTimezoneWorkaround.apply()` in `@BeforeAll`. Don't reach for Testcontainers otherwise.
- **No test calls the AI model.** Nothing in the suite costs tokens.

## Frontend

Vitest with Testing Library. Most tests target framework-free logic in `src/lib/` directly rather than rendered components; prefer that shape for new logic. Also run `npx tsc --noEmit` and `npm run build` before calling a frontend change done.

## What automated tests don't cover

These are verified by hand. If you change one, verify it against the real thing — a green test run says nothing about them:

| Area | How to verify |
|---|---|
| The live-preview pipeline (Kubernetes, Redis, the proxy) — only the pod-claim step and the token scheme are unit-tested | Start the backend against a local kind cluster and open a real preview ([running previews locally](../local-development/live-previews.md)) |
| Stripe billing end to end | Stripe test mode with card `4242 4242 4242 4242`, including the webhook |
| Service start-up and bean wiring | `./mvnw -pl <module> spring-boot:run` — a wiring cycle or missing bean shows up only when a real context starts |
| Backup and restore (`deploy/k8s/base/backup.yaml`, `deploy/scripts/restore-*`) | Rerun the restore drill on a dedicated kind cluster: seed, fingerprint, back up, damage, restore, compare ([backups](../operations/backups.md)) |

## Adding tests

- New business logic gets a plain JUnit test next to its package.
- A new endpoint gets its path added to `RoutingTableTest` if the prefix is new.
- A new authorization rule gets a test that proves both that the right caller is allowed and that everyone else is denied.
