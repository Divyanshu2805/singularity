# Tech Stack

- **Language:** Java 25
- **Framework:** Spring Boot 4.1.0
  - Spring Web MVC (`spring-boot-starter-webmvc`)
  - Spring Data JPA (`spring-boot-starter-data-jpa`)
- **Database:** PostgreSQL — datasource configured in `application.yaml`, `ddl-auto: update`
- **Build tool:** Maven (via Maven Wrapper)
- **Other libraries:** Lombok, MapStruct 1.6.3 (compile-time entity↔DTO mapping, `mapper` package), Bean Validation (`spring-boot-starter-validation`, for `@NotBlank`/`@Email`/`@Size`/`@NotNull`/`@Valid` on request DTOs), Spring Security (`spring-boot-starter-security`, `security` package — JWT-based, stateless), JJWT 0.12.6 (`jjwt-api`/`jjwt-impl`/`jjwt-jackson` — token generation/verification in `AuthUtil`), Stripe Java SDK 31.1.0 (`stripe-java`, added 2026-05-02 — Checkout Sessions, webhook signature verification, typed event objects; `PaymentConfig` sets the SDK's static `Stripe.apiKey` from `stripe.api.secret` at startup), Spring AI `spring-ai-starter-model-openai` (`spring-ai-bom` 2.0.0-M1, added 2026-05-16 — `ChatClient`/`ChatModel` pointed at OpenRouter's OpenAI-compatible API via `spring.ai.openai.base-url`; `llm` package), MinIO Java SDK 8.6.0 (`io.minio:minio`, added 2026-05-16 — object storage for project file content, `config.StorageConfig`), springdoc-openapi-starter-webmvc-ui 3.0.1 (added 2026-05-24, later pass — auto-generates an OpenAPI spec and Swagger UI at `/v3/api-docs`/`/swagger-ui.html`; both currently require a valid `Bearer` JWT like any other non-`/api/auth/**` path, since `WebSecurityConfig` has no exemption for them yet, so a plain unauthenticated visit gets a `403`)
- **Live previews:** fabric8 `kubernetes-client` 6.13.4 (`config.KubernetesConfig`, `service.impl.PreviewRunnerPool`/`PreviewBootstrapper` — claims/execs into runner pods) and `spring-boot-starter-data-redis` (`config.RedisConfig`'s `StringRedisTemplate` — `service.impl.PreviewRouter` writes hostname→pod routes, read by the standalone `proxy/index.js`), both added 2026-07-15.
- **Auth:** Firebase Admin SDK 9.10.0 (`com.google.firebase:firebase-admin`, added 2026-07-15 — verifies Firebase ID tokens/session cookies, revokes sessions, imports users; `config.FirebaseConfig`), alongside JJWT 0.12.6 for the legacy Bearer-token rollback path. Spring Mail (`spring-boot-starter-mail`, same date) for password-reset emails, sent through local Mailpit in dev (`services.docker-compose.yml`).
- **Testing:** Spring Boot Test, JUnit 5 (`spring-boot-starter-webmvc-test`, `spring-boot-starter-data-jpa-test`). The generated `contextLoads` smoke test has likely never actually passed via `./mvnw test` on a Windows dev machine reporting the legacy `Asia/Calcutta` timezone alias — the fix for that (`TimeZone.setDefault(...)` in `VibecraftApplication.main()`) never runs under `@SpringBootTest`, since Spring's test infrastructure calls `SpringApplication.run(...)` directly rather than going through `main()`. Found 2026-05-16 while verifying this pass's schema changes; not fixed since it's a pre-existing gap unrelated to this batch — `./mvnw spring-boot:run` (which does go through `main()`) remains the way to verify a change actually boots.

## Frontend (`frontend/`, tracked in this repo since 2026-07-15)

- **Framework:** React 18 + TypeScript, built with Vite 5. Routing via `react-router-dom` 6.
- **Styling/UI:** Tailwind CSS 3 + the shadcn/ui component set (Radix UI primitives, `components.json`, `src/components/ui/`), `lucide-react` icons.
- **State/data:** `@tanstack/react-query` 5 for server state; app-specific state (the streaming chat transcript, code-notes threads, teaching-mode toggle) lives in plain module-level stores (`lib/project-chat-store.ts`, `lib/code-lens-store.ts`) rather than a global state library, each registered with `lib/session.ts`'s `onSignOut` so a route change alone can't leak one account's data into the next.
- **Editor:** CodeMirror 6 (`@codemirror/lang-*`, `@codemirror/merge` for the unified diff view, `@codemirror/theme-one-dark`).
- **Auth:** Firebase JS SDK 12 (`lib/firebase.ts`/`firebase-auth.ts`) — every sign-in method runs client-side against Firebase; the backend only ever verifies the ID token it's handed.
- **Forms/validation:** `react-hook-form` + `zod`.
- **Charts:** `recharts` (`pages/UsageInsights.tsx`).
- **Markdown/code rendering:** `react-markdown` for chat text, the editor's own CodeMirror/Lezer grammars (not a second highlighting library) for embedded code blocks — see `lib/highlight-code.ts`.
- **Testing:** Vitest + Testing Library (`@testing-library/react`, `@testing-library/jest-dom`) — 270 tests across 27 files, `npm test`. `src/test/setup.ts` stubs `ResizeObserver`, which jsdom doesn't have.
- **Build tool:** `npm` (`package-lock.json` is the committed lockfile; `bun.lockb` exists locally but is gitignored — not what's actually installed with).
