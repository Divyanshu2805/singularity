# 2. Module Map

## Backend (`legacy-monolith/src/main/java/com/java/vibecraft/` — paths below are relative to that, unchanged since the Phase 0 move)

| Package | Owns | Must never |
|---|---|---|
| `entity`, `enums` | JPA schema — see `docs/schema/` | Contain business logic beyond `@PrePersist`-free lifecycle |
| `repository` | Spring Data JPA interfaces, `@Query` JPQL added only as a service needs it | Contain business logic — a repository answers a query, it doesn't decide anything |
| `mapper` | Entity↔DTO conversion (MapStruct, plus a couple of hand-written `default` methods where the shapes genuinely differ — `CodeNoteMapper`) | Duplicate what MapStruct would auto-match |
| `service` / `service.impl` | Business logic — one interface + one `@Service` impl per concern | Be skipped — a controller never talks to a repository directly |
| `controller` | REST endpoints, `@PreAuthorize` gates, request/response mapping | Contain business logic beyond orchestrating a service call |
| `dto` | Request/response records, one subpackage per domain | Carry validation annotations on a *response* record |
| `security` | Session/JWT auth, rate limiting, `@PreAuthorize` SpEL root (`SecurityExpressions`) | Be bypassed by a controller reading `userId` from anywhere but `AuthUtil` |
| `error` | `ApiError`, typed exceptions, `GlobalExceptionHandler` | Let a new exception type fall through to the generic 500 handler unintentionally |
| `llm` | The AI code-generation prompt/parser/tools/advisors, the code-insight prompts, teaching mode, usage recording | Let `CodeInsightPrompts` (read-only) ever see the `<file>`/`<todo>`/`<learn>` write protocol |
| `config` | Bean wiring — Stripe, MinIO, Spring AI, Kubernetes, Redis, CORS, Firebase, the plan-seeding `ApplicationRunner` | Live outside `com.java.vibecraft`'s component-scan root (a real historical bug — see `CLAUDE.md`) |
| `util` | Small, framework-free, directly-unit-testable helpers (content-type detection, code search's line matcher, money/duration formatting) | Depend on Spring, a repository, or anything not passed as a plain argument |

## Frontend (`frontend/src/`)

| Directory | Owns | Must never |
|---|---|---|
| `pages/` | Top-level routed views (`ProjectView.tsx`, `ProjectsDashboard.tsx`, `BillingSettings.tsx`, …) | Hold logic that isn't specific to that page — extract to `lib/`/`hooks/` |
| `components/` | Feature components. `components/ui/` is the vendored shadcn/ui primitive set — Radix UI + Tailwind variants, treated as a library, not app code | Import app-specific state stores from `components/ui/` |
| `hooks/` | Custom React hooks — most wrap a `lib/` store or add React lifecycle around it | Contain business logic that doesn't need React (put that in `lib/`, test it there) |
| `lib/` | API client, SSE/stream parsing, module-level state stores (chat, code notes), and the framework-free logic most of the 270 frontend tests actually exercise | Import from `components/`/`pages/` (the dependency direction is one-way) |

**Module-level stores, not a global state library:** the streaming chat transcript (`lib/project-chat-store.ts`) and code-notes threads (`lib/code-lens-store.ts`) live in plain module-level maps rather than React context or a state library. This means they persist for the life of the *page*, not just a component's lifecycle — which is exactly why `lib/session.ts`'s `onSignOut(...)` registry exists: every such store must register a reset, or its contents survive a client-side route change after sign-out (see §6 Auth & Tenancy).
