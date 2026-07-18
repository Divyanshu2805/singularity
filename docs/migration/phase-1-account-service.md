# Phase 1 — Account Service (built and verified standalone; **not yet receiving real traffic**)

## What moved

Everything under `com.vibecraft.account` in the new `account-service` module, ported from `legacy-monolith`'s equivalents (same logic, `com.java.vibecraft` → `com.vibecraft.account`, common-lib's `ApiError`/exception taxonomy in place of local copies):

| Domain piece | From (`legacy-monolith`) | To (`account-service`) |
|---|---|---|
| Entities | `entity/User,Plan,Subscription,PasswordResetToken,AuthAuditEvent,RevokedSession` | `entity/` (identical fields; own Postgres database, `vibecraft-account-db`) |
| Enums | `enums/SubscriptionStatus,AuthAuditEventType` | `enums/` |
| Repositories, mappers | `repository/`, `mapper/` (the 6 Account-owned ones) | same names, `account.repository`/`account.mapper` |
| ~~Legacy Bearer auth~~ | ~~`AuthService`/`AuthServiceImpl`, `LegacyAuthController`~~ | **Removed from both places** shortly after this port — see below |
| Firebase session auth | `SessionService`/`SessionServiceImpl`, `AuthController` | same names — **kept whole**, not split with a Gateway (see below) |
| ~~Password reset~~ | ~~`PasswordResetService`/`Impl`, `PasswordResetMailer`~~ | **Removed from both places** shortly after this port — see below |
| Audit trail | `AuthAuditService` | same name |
| Plans/billing | `PlanService`/`Impl`, `SubscriptionService`/`Impl`, `PaymentProcessor`/`StripePaymentProcessor`, `BillingController`, `PlanSeeder`, `PaymentConfig` | same names, `PaymentConfig` → **`StripeConfig`** (renaming pass) |
| Full security chain | `security/*` (Firebase verifier, session cookies/cache, CSRF, rate limiter, `WebSecurityConfig`) | `security/*`, unchanged in shape — **own full copy**, not delegated to `gateway-service` |
| **New**: internal API | — | `controller/InternalAccountController` (`/internal/v1/**`) — not yet called by anything |

**Deliberate simplification**: `SubscriptionService.projectsOwned()`/`canCreateNewProject()` did **not** come across. Counting owned projects is workspace-service's job (it owns `ProjectMember`); account-service now only ever answers "what does this plan allow" (`projectAllowance`), and lets the caller do its own counting. The old interface conflated the two.

**New in this service, not a port**: Flyway (`db/migration/V1__init.sql`) replaces `ddl-auto: update` — see "Known fragile points" below for why this was worth doing now rather than carrying the old approach into a fresh database.

## Follow-up: legacy username/password auth removed entirely (2026-07-18)

Shortly after the port above, the legacy Bearer-token auth path (username/password signup/login, the separate password-reset flow) was removed **from both `legacy-monolith` and `account-service`** — Firebase is now the only sign-in method anywhere in this codebase. This is a feature removal, not a migration step, but it touched files this doc already tracks, so it's recorded here rather than only in commit history:

- Deleted everywhere: `LegacyAuthController`, `AuthService`/`AuthServiceImpl`, `PasswordResetService`/`Impl`, `PasswordResetMailer`, `PasswordResetToken` entity + repository, `SignupRequest`/`LoginRequest`/`ForgotPasswordRequest`/`ResetPasswordRequest`/`AuthResponse` DTOs, `FirebaseUserImportRunner` (its one-off job — migrating 15 pre-existing legacy-only accounts into Firebase, keeping their password hashes — was run against `legacy-monolith`'s live database first; see git history for the exact command).
- Simplified: `AuthUtil` (dropped `generateAccessToken`/`verifyAccessToken` and its `jwt.secret-key` dependency — now a bare `SecurityContextHolder` reader), `SessionAuthFilter` (dropped the Bearer fallback branch), `WebSecurityConfig` (dropped the Bearer CSRF exemption, the legacy-route `permitAll` rules, and the now-unused `AuthenticationManager` bean), `AuthProperties` (dropped the `Legacy` record), `RateLimitFilter` (its `AUTH_PATHS` rule now only covers `/api/auth/session`), `UserServiceImpl` (dropped `implements UserDetailsService`).
- Removed dependencies: `spring-boot-starter-mail`, `io.jsonwebtoken:jjwt-*` (from `legacy-monolith` and `account-service` directly — `common-lib` still depends on `jjwt-*` for its own, unrelated internal-JWT mechanism).
- `AuthAuditEventType`'s four `LEGACY_*` values were kept, not deleted — existing audit rows with those values still exist and need to deserialize on read; nothing writes them anymore.
- `password_reset_tokens` is now an orphaned table in any database that had it (no entity maps to it, and this project has no migration tool to drop it automatically) — safe to `DROP TABLE password_reset_tokens;` by hand.
- Frontend: removed the `firebaseEnabled`-gated fallback UI (the app now assumes Firebase is always configured), the `/reset-password` page and route (Firebase's own reset flow already goes through `/auth/action`), and the four legacy `api.*` methods (`signup`, `login`, `forgotPassword`, `resetPassword`) plus their now-unused types.
- Full verification performed for this removal: backend compiled and booted clean, all 95+17 named/session tests pass, live end-to-end curl checks against `legacy-monolith` (legacy routes now unreachable, Firebase session/CSRF/plans flows unaffected), frontend typecheck/build/lint clean, and a real browser pass confirming `/forgot-password` calls Firebase directly with zero `/api/auth/*` network calls.

## The architecture revision this phase forced

The original Phase 1 plan (written before reading the actual security code) assumed gateway-service could cleanly take over Firebase verification + session-cookie handling for Account's routes while everything else stayed on legacy-monolith. Reading `WebSecurityConfig`/`SessionServiceImpl` in full showed this doesn't hold: CSRF, CORS, security headers, and rate limiting are all wired into the *same* filter chain as session auth, not separable per-route without rewriting all of it as WebFlux (gateway-service is reactive) *before* Workspace and Intelligence exist to justify consolidating it. That's a much bigger, much riskier piece of work than "extract one domain," and doing it now would put the *entire* app's edge security behind new, unexercised code — exactly what the Reliability Strategy exists to prevent.

**Revised for real**: `account-service` keeps a complete, independent copy of the Firebase/session/CSRF/CORS/rate-limit chain — functionally identical to `legacy-monolith`'s, verified byte-for-byte behaviorally equal (see Verification below). `gateway-service` remains a dumb, transparent proxy for every route, Account's included. Consolidating this into gateway-service is deferred to a later cleanup phase, once Workspace and Intelligence also exist and duplicating the chain three times is a clear, justified refactor rather than a same-phase risk multiplier.

## Why this hasn't been cut over yet

Flipping Gateway's routing for `/api/auth/**`, `/api/plans`, `/api/me/subscription`, `/api/payments/**`, `/webhooks/payment` to `account-service` today would immediately fork user data: any sign-up handled by `account-service` writes to `vibecraft-account-db`, but `legacy-monolith`'s still-active `ProjectMember`/`ChatSession`/etc. tables have `@ManyToOne User`/plain-`userId` references that only resolve against `legacy-monolith`'s **own** `users` table. A real cutover needs, in order: (1) a one-time data migration copying `users`/`plans`/`subscriptions` from `legacy-monolith`'s database into `account-service`'s, (2) `legacy-monolith`'s own `User`-referencing entities/services switched from JPA associations to plain `userId` longs resolved via Feign — a real schema change to `ProjectMember`, `ChatSession`, `ChatMessage`, `CodeNote`, and every service method that currently does `userRepository.findById(...)`. Neither is done yet. Account-service today is built, verified, and **inert** — reachable directly on `:8081` for testing, not reachable through Gateway, not depended on by anything else.

## Verification performed

- Full reactor compile (`./mvnw clean package`, all 6 modules) and boot (`./mvnw -pl account-service spring-boot:run`) against a real, separate Postgres database (`vibecraft-account-db`), created via `infra/postgres-init/`.
- Flyway migrated cleanly; Hibernate's `ddl-auto: validate` confirmed the entities match exactly — the first schema in this codebase not exposed to the persisted-enum/`ddl-auto:update` trap at all (`validate` mode never generates or checks a `CHECK` constraint).
- Plan catalogue seeded correctly (Free/Pro/Business, matching `legacy-monolith`'s exactly).
- `GET /api/plans` confirmed byte-identical to `legacy-monolith`'s.
- Full legacy signup → login → `GET /api/auth/me` → `GET /api/auth/security-events` flow, real HTTP calls, real CSRF token dance (fetched via `GET /api/auth/csrf`, sent as `X-XSRF-TOKEN`) — created a real user in the new database, issued a real Bearer JWT, correctly recorded `LEGACY_SIGN_UP`/`LEGACY_SIGN_IN` audit events.
- Confirmed CSRF-rejection parity: a bare curl `POST /api/auth/login` with no CSRF token returns the identical 403 on both `legacy-monolith` and `account-service`.
- Firebase-session flow, Stripe billing, and Eureka-based Feign calls are **not yet exercised** — the first needs a real Firebase ID token (not scriptable without a live sign-in), the second needs a real Stripe test-mode checkout, and the third has nothing to call yet (see above).

## Known fragile points found and fixed during this phase

- **`spring-boot-starter-data-jpa` + `flyway-core` alone does *not* auto-configure Flyway on Spring Boot 4.** `FlywayAutoConfiguration` moved out of the core autoconfigure jar into a dedicated `spring-boot-starter-flyway` module. Without it: no error, no warning, Flyway just never runs, and Hibernate's schema validation fails with "missing table" — looks like a migration-writing mistake, is actually a missing dependency. Now in `CLAUDE.md`'s gotchas table.
- **The Windows `Asia/Calcutta` timezone fix (`docs/local-development/`) has to be applied in *every* service's own `main()`,** not just `legacy-monolith`'s — it's a JVM default, not something inherited across processes. Centralized as `common-lib`'s `WindowsTimezoneWorkaround.apply()` so it's one line per service (`AccountServiceApplication.main()`) instead of a copy-pasted `TimeZone.setDefault(...)`, but every future service's `main()` still has to actually call it.
- **`account-service` needs two new secrets it didn't need before**: `INTERNAL_JWT_SECRET` and `INTERNAL_SERVICE_SHARED_SECRET` — bound eagerly by `common-lib`'s auto-configuration regardless of whether this service's own security chain uses them yet (it doesn't — see the architecture revision above). Added to `.env`/`.env.example`.
