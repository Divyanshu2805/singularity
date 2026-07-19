# Phase 4 — Cutover (traffic now runs through the three services; `legacy-monolith` kept as rollback)

No domain code moved in this phase. Three things changed: the Gateway's route table, the data, and the tests that pin the routing.

## Why one atomic cutover, not one domain at a time

`legacy-monolith`'s tables are joined inside one database. Flip only account and legacy stops seeing new sign-ups and plan changes; flip only workspace and members/projects drift away from users. So all three domains flip together, from one migrated snapshot, and the rollback switch is **one profile**, not three toggles. This is also why Phase 1/2's "legacy-monolith's own entities need converting to plain ids first" was never needed: nothing joins across the old tables any more once legacy is off.

## What changed

**1. Gateway route table** (`gateway-service/src/main/resources/application.yaml`). The single `Path=/**` catch-all became five ordered routes; lower `order` wins:

| order | route id | `Path=` | target |
|---|---|---|---|
| 10 | `intelligence-code-insight` | `/api/projects/*/code/**` | `lb://intelligence-service` |
| 20 | `intelligence` | `/api/chat/**`, `/api/ideas/**`, `/api/usage/**` | `lb://intelligence-service` |
| 30 | `workspace` | `/api/projects/**`, `/api/previews/**` | `lb://workspace-service` |
| 40 | `account` | `/api/auth/**`, `/api/plans/**`, `/api/me/**`, `/api/payments/**`, `/webhooks/payment` | `lb://account-service` |
| 100 | `legacy-monolith-fallback` | `/**` | `http://localhost:8080` |

Targets are `${routing.<domain>.uri}` (env `ACCOUNT_ROUTE_URI` / `WORKSPACE_ROUTE_URI` / `INTELLIGENCE_ROUTE_URI` / `LEGACY_MONOLITH_URI`). `/internal/**` matches only the fallback, so the services' machine-to-machine endpoints are never reachable from the browser's origin.

**2. Rollback profile** (`application-legacy-routing.yaml`) repoints all three domain routes at `legacy-monolith` at once. See "Rolling back".

**3. Tests** (`gateway-service/src/test/.../`, the first tests in that module). `RoutingTableTest` and `LegacyRoutingProfileTest` boot the real Gateway context (Eureka off, no DB, no server) and evaluate the actual `RouteLocator` against every distinct URL the 62 controller mappings expose (51 paths, checked mechanically against the legacy controllers), plus the boundary cases (`/api/projects/7/codex` is *not* code-insight; `/api/projects-archive` is not `/api/projects`; `/internal/**` never reaches a service). 120 assertions, run under both the default and rollback profiles. **Mutation-checked**: moving the code-insight route behind the workspace route fails 8 of them. Run: `./mvnw.cmd -pl gateway-service test -Dtest='RoutingTableTest,LegacyRoutingProfileTest'`.

**4. Data migration** (`infra/data-migration/legacy-to-services.sh`). Copies every legacy table into its service's database, one transaction per database. **Dry-run by default (rolls back); `--execute` commits.** Legacy is only ever read.

| Decision | Detail |
|---|---|
| Column lists | Read from the *target's* `information_schema`, so the script can't drift from Flyway. A target column with no legacy source is an error, never a silent NULL. |
| Not copied | `users.google_subject` (0 non-null rows), `project_files.created_by` / `updated_by` — columns dropped on purpose in Phases 1-2. |
| Timestamps | Legacy `timestamptz` → the services' `timestamp without time zone` as `col AT TIME ZONE 'UTC'`. The services store and read UTC wall-clock in those columns (verified against a real write: `created_at 10:50:18` vs a tool-result timestamp of `10:50:24Z`), so this is exact and independent of any session time zone. |
| Sequences | Legacy ids are identity columns, the services' are `BIGSERIAL`; `COPY` doesn't advance sequences, so each is `setval`'d to `max(id)` (skipped in dry-run — `setval` isn't transactional). Verified equal to legacy's own last values, so no old id is ever reissued. |
| Plans | Legacy plan ids are 2/3/4; account-service had seeded its own. The migration replaces them (subscriptions reference the legacy ids). `PlanSeeder` upserts on stripe price id / name, so it no-ops on the next boot — confirmed, no duplicates. |
| Guards | Refuses to run while *any* session is open on the four databases (stop legacy + the three services first — guarantees a quiescent source and lets `TRUNCATE` lock). Fails if a legacy table isn't mapped, or a target has an unmapped table. Row counts are asserted per table inside the transaction; a mismatch aborts everything. |
| Dangling ids | Reported, copied anyway (the services hold cross-service references as plain columns, no FK). One finding: 6 `usage_logs` rows for user ids 2,5,6,7,8,9 — accounts deleted from legacy, all single-day token counters dated 2026-05-24. Harmless; the daily budget only reads `(user, today)`. |
| Not migrated | File bytes. `project_files` rows are metadata; the bytes live in MinIO (`projects` bucket) and Redis holds preview routes, both shared unchanged between legacy and workspace-service. |

**Cutover as run (2026-07-19)** — every table's row count equals legacy's:

| account-service | | workspace-service | | intelligence-service | |
|---|---|---|---|---|---|
| plans | 3 | projects | 84 | chat_sessions | 43 |
| users | 18 | project_members | 94 | chat_messages | 164 |
| subscriptions | 4 | project_files | 1,514 | chat_events | 1,344 |
| revoked_sessions | 38 | previews | 20 | code_notes | 17 |
| auth_audit_events | 116 | preview_sessions | 2 | usage_events | 117 |
| password_reset_tokens | 0 | | | usage_logs | 16 |

The migration also wiped what the services had accumulated while being verified standalone: Phase 1's `smoketest@example.com` user (+2 audit rows) and Phase 3's test `usage_events` row.

## Runbook (to redo or rehearse the cutover)

1. Stop `legacy-monolith` and all three services (Postgres, MinIO, Redis stay up).
2. `bash infra/data-migration/legacy-to-services.sh` — the dry-run. Check counts and the dangling-id report.
3. `bash infra/data-migration/legacy-to-services.sh --execute`.
4. Start, in order: `discovery-service`, `account-service` + `workspace-service` + `intelligence-service`, then `gateway-service` (the Gateway resolves `lb://` from Eureka's registry, so the services should be registered before its first request).
5. Smoke through `:8000`, then a signed-in pass.

**Do not re-run `--execute` after the new services have taken real writes** — it truncates them. That is the reason for the dry-run default.

## Rolling back

Stop the Gateway, start `legacy-monolith` (`./mvnw.cmd -pl legacy-monolith spring-boot:run`), restart the Gateway with `--spring.profiles.active=legacy-routing`. `legacy-monolith`'s database was only ever read by the migration, so it comes back exactly as it was at cutover. **Anything written to the new services' databases after the cutover is *not* copied back** — accepted for a pre-launch app, but it means rollback gets more expensive the longer the new stack runs. With legacy off, an unowned path (`/`, `/nope`) answers `500` (the Gateway's connection-refused to `:8080`), not `503`.

## Verification performed

- `RoutingTableTest` / `LegacyRoutingProfileTest`: 120 assertions green; mutation-checked (see above).
- Endpoint parity: legacy's 10 controllers and the three services' 10 controllers expose the identical 62 method+path mappings (diffed mechanically).
- Migration dry-run (rolled back; target databases confirmed unchanged afterwards), then `--execute`. Beyond row counts, **independent MD5 aggregates on both sides matched** for users, subscriptions, revoked_sessions, projects, project_files, chat_messages (full message text), chat_events (all eight columns, including `content`/`previous_content`) and usage_events, with legacy timestamps converted to UTC — so it covers the timezone rule and text integrity, not just cardinality.
- All three services booted against the migrated data: Flyway validation passed, `PlanSeeder` no-op'd, `UsageLedgerBackfill` saw 117 existing rows and did nothing, all three registered in Eureka.
- Through the Gateway, with legacy off: `/api/plans` byte-identical to account-service called directly (and showing the migrated plan ids); protected routes return 401 — and **timestamp-correlating each 401 against each service's own log** showed `/api/auth/me` reached only account-service, `/api/projects` and `/files` only workspace-service, `/api/usage/today` and `/api/projects/7/code/notes` only intelligence-service (so the code-insight precedence holds live, not just in the test). `/internal/v1/**` and `/nope` reached no service.
- From a real browser context (Vite `:5173` → Gateway → services): `/api/plans` 200, `/api/auth/csrf` 204 + `XSRF-TOKEN` cookie, protected routes 401 JSON.
- **The migrated data is what the services actually serve** (checked through their `/internal/v1/**` APIs with the shared secret): a real subscriber's `plan-limits` came back as the real Business plan (10 projects / 500,000 tokens / 10 previews), not the free-tier fallback; `owned-count` for a real user equals legacy's own count (17 = 17); for a live project, membership (`OWNER`, `VIEWER`, and `role: null` for a non-member), the project summary, and the file tree (24 entries = 24 rows in legacy) all match, and a real file's **bytes were read back from MinIO** through workspace-service using the migrated metadata — so the "shared bucket, no byte migration" assumption holds with actual content. A soft-deleted project correctly answers 404.
- CSRF is enforced identically through the Gateway and directly (`POST /api/auth/session`, `/api/projects`, `/api/chat/stream`, `/api/ideas/clarify` with no token → 403). `POST /webhooks/payment` with no session and no CSRF token reaches the billing controller (the exemption works through the Gateway); a request lacking `Stripe-Signature` gets a 500 there and in legacy alike — by code inspection, neither `GlobalExceptionHandler` maps `MissingRequestHeaderException` — pre-existing, and real Stripe deliveries always carry the header.

## Found by the first signed-in requests: no Feign call between services had ever authenticated

Within 25 seconds of the first real Google sign-in on the new stack (2026-07-19 13:15Z), workspace-service and intelligence-service each logged 8 HTTP 500s — every one a `FeignException$Unauthorized: [401] during [GET] to [http://account-service/internal/v1/sessions/revoked?cookieHash=…]`. **Any signed-in request to workspace-service or intelligence-service failed**, because each authenticates a session cookie by asking account-service whether it was revoked. Account-only flows (sign-in, sign-out) were unaffected, which is why they worked while everything else 500'd.

*Cause.* `/internal/**` is guarded by `InternalServiceAuthFilter`, which accepts **only** the `X-Internal-Service-Token` shared secret — deliberately not a user JWT. `common-lib`'s `FeignClientInterceptor`, the caller side, only ever forwarded a user JWT (and the Gateway mints none), so nothing in the codebase sent the secret. Phases 1-3 each verified the internal endpoints with `curl` *plus* the secret, which proved the callee and never the caller; the Phase 2/3 notes that "the Feign plumbing was only verified at the unauthenticated internal-API layer" were describing exactly this hole without knowing its size.

*Fix.* The interceptor now sends the secret on any call whose path starts with `/internal/` (only those, so it can never ride along to anything else), sharing one header-name constant with the filter. `FeignClientInterceptorTest` (6 tests, in `common-lib`) includes one that feeds the interceptor's output into the real `InternalServiceAuthFilter` — the join that had never been tested — and was mutation-checked: removing the fix fails 4 of 6. Verified at runtime without a session: a request with a bogus `vc_session` cookie (which makes the service make that exact Feign call before it verifies the cookie) went from 500 to a clean 401 on both services, and account-service stopped logging the 401 it used to log for the rejected internal call.

*Blast radius.* The cutover was live-broken for signed-in workspace/intelligence traffic from the routing flip until this fix; the only signed-in traffic in that window was the 13:15Z sign-in above. Rolling back was available throughout and unnecessary once the fix was a ten-line change.

## Signed-in verification (2026-07-19, real Google/password sign-ins)

Sign-ins went through Gateway → account-service and resolved to **existing migrated users** by Firebase uid (audit rows 118-121; the user count stayed at 18, no duplicates). The main pass ran as user 36 in the built-in browser, against a throwaway project of my own (id 131, soft-deleted afterwards), with the user's own project 126 only read.

| Area | Result |
|---|---|
| Reads across all three services | `/api/projects`, `/api/me/subscription`, `/api/usage/{today,limits,insights,events}`, `/api/previews` all 200 and equal to what legacy's DB said for that user (1 project as `EDITOR`, Business plan `ACTIVE`, 0 tokens). `usage/today`'s `projectsUsed` comes from intelligence → workspace over Feign. |
| Project lifecycle | Create → 201 as `OWNER`, **id 131, i.e. straight after legacy's max of 130** (the sequence reset worked); template files initialised (15); rename, pin, star, members, delete (soft, then 404). |
| AI build turn over SSE | 93 events in 61 network chunks spread over 1.2 s through Vite → Gateway → intelligence (progressive, not buffered). The model's `<file>` write landed as a workspace `project_files` row (id 1740), readable through `/files/content`, with the right `chat_events` (THOUGHT, MESSAGE, TODO, FILE_EDIT…) and `last-turn-changes`. So the intelligence → workspace Feign **write** path works. |
| Talk-only turns | No `<file>` tag, no file changes. One took 68 s before its first token, then arrived in 0.2 s; a repeat took 2.6 s. Not explained: internal calls measured 8–16 ms and no retry/timeout was logged, so most likely upstream model latency. |
| Idea clarifier | `clarify` (4 questions) and `compile` (a spec) 200; a blank idea → field-level 400. |
| Code-insight | Sync `explain`/`ask` 200 (the answer cited routes beyond the snippet sent, so the read-only file tool over Feign works); `ask/stream` and `explain/stream` deliver the documented **plain-string** `data:` events, unlike chat's JSON; notes create/list/delete-one/delete-all with ids continuing from legacy's 32. |
| Usage billing | 11 `usage_events` for user 36 (BUILD ×3, IDEA_INTERVIEW ×2, EXPLAIN ×6 including both SSE calls) — each attributed to the right user and project — and the daily counter equalled the sum of events exactly. This is the off-request-thread recording path fixed in Phase 3. |
| Daily budget (402) | With the counter temporarily set to the limit: chat stream, idea clarify, and both code streams returned **402** with the quota payload (`DAILY_TOKENS`, limit/used/resetsAt/plan). The counter was then restored to the true sum of events. |
| Authorization | A non-member got 403 on project, chat history, code notes, and zip; an `EDITOR` inviting a member got 403; unknown-user invite → 404 (the Feign not-found is mapped); bad email → 400. **One gap — see below.** |
| CSRF | Enforced identically through the Gateway. The `XSRF-TOKEN` cookie **rotates on every response** from every service (all four use the identical `csrf.spa()` config, so that's inherited, not new); the frontend already retries once on a CSRF 403. |
| UI smoke | Dashboard and project workspace render correctly against the new stack (chat history with the file-edit card, file tree, code viewer, token meter); every page-load request was 2xx. |
| Sign-out | `POST /api/auth/logout` 204; every service returned 401 afterwards; a `revoked_sessions` row was written (40 → 41), the audit `SIGN_OUT` recorded, and account-service's internal check answers `true` for that session (and `false` for an unknown one) — the exact call the other services make on a cache miss. |

## Found and left alone (pre-existing — both stacks — spun off as separate tasks)

- **Any signed-in user can list and read the files of any private project by id.** `GET /api/projects/{id}/files` and `.../files/content` have no permission check: `ProjectFileServiceImpl.getFileTree`/`getFileContent` are unguarded while zip, search, and copy carry `@PreAuthorize`. Verified live (a non-member read a 24-file tree and a file's contents). Byte-identical in `legacy-monolith`, so not a cutover regression. The guard belongs on `FileController` rather than the service, because `InternalWorkspaceController` calls that service as the `internal-service` principal.
- **Live preview cannot start** (503): `kubernetes-client 6.13.4` throws a Jackson NPE (`keySerializer is null`) when it serializes a Pod that carries `managedFields`, under Boot 4.1.0's Jackson 2.21.4. **Reproduced in isolation on `legacy-monolith`'s own classpath**, so the monolith would fail the same way; it is not the split. The failed claim left no rows and no claimed pod. Not verified further — the port-forward and cluster were healthy.
- **The non-streaming `explain`/`ask` are not budget-gated** (only chat, ideas, and the two stream variants are), identically in legacy.
- **A missing `Stripe-Signature` header returns 500** rather than 400, in both (`MissingRequestHeaderException` is unmapped).

## Behavior change from the split: sign-out takes up to 60 s to reach workspace and intelligence

Each service caches validated sessions in its own process for `auth.revocation-check-interval` (60 s, identical to legacy). In the monolith a sign-out evicted that one cache immediately; now only account-service's cache is evicted, so a signed-out cookie can keep working against workspace-service and intelligence-service for up to a minute (sign-out-everywhere likewise). Bounded and small, but it is a genuine weakening for the stolen-cookie case. A conclusive live replay wasn't possible — the session cookie is `httpOnly`, and requests I raced against the logout landed inside its own 64 ms window — so this is established from the code and config, not observed. Closing it needs cross-service eviction (or a shorter interval); it's the same single-instance in-memory caveat `TODO.md` already tracks.

## Not exercised

Sign-out-everywhere (deliberately skipped: it would sign that account out on every device, and it isn't mine); a positive invite/accept and a positive fork (each would write into another person's real project or account); live K8s preview (blocked by the bug above); Stripe checkout and webhook delivery with real events (needs the Stripe CLI in test mode). Residue on user 36's account from the pass: 11 usage events, the chat rows for the deleted test project, and a soft-deleted project.

## Known fragile points

- **Route order is load-bearing.** `/api/projects/{id}/code/**` (intelligence) sits under `/api/projects/**` (workspace); it only works because it has the lower `order`. `RoutingTableTest` pins this — when a controller gains or loses an endpoint, its path table changes in the same commit, or the new path silently falls through to the (off) fallback and shows up as a 5xx.
- **Cross-service calls authenticate with the shared secret, added by `FeignClientInterceptor` only for `/internal/**` paths.** Don't put `@FeignClient(path = "...")` on an internal client: interceptors run before that prefix is applied, so the path check misses it and every call is a 401. New internal endpoints need no extra wiring, but they must live under `/internal/`.
- **Testing an internal endpoint with `curl` and the secret proves the callee, not the calling service.** That is precisely how the Feign bug above survived three phases. Exercise a cross-service path through a real (or bogus-cookie) request to the *calling* service.
- **Partial cutover is unsafe.** Don't point one domain back at legacy on its own (the per-domain `*_ROUTE_URI` env vars allow it): the two sides hold different data.
- **`setval` is non-transactional**, so a dry-run deliberately skips it; a real run that fails after the sequence step would leave sequences advanced while the data rolled back (harmless — ids only skip — but worth knowing).
- **The Stripe CLI forward target changed** from `:8080` to the Gateway (`:8000`); `.env.example` was updated. A stale forward to `:8080` now hits nothing.
- **The preview tool caps a worktree at 5 servers.** The backend needs 5 (discovery, account, workspace, intelligence, gateway); the frontend (`npm run dev`) has to run from your own terminal.

## What's left

1. Once you've used the new stack for a while: delete `legacy-monolith/`, the `legacy-monolith-fallback` route, the `legacy-routing` profile (and `LegacyRoutingProfileTest`), and `LEGACY_MONOLITH_URI` — a separate commit, so reverting it alone restores the fallback.
2. Phase 5: rewrite `docs/architecture/` / `docs/schema/` / `docs/api/` for the service split (they still describe the monolith), and read this file end to end.
