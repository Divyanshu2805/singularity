# VibeCraft

An AI-assisted project-building platform: describe an idea, answer a few questions about it, and get a project built for you via AI chat — with live previews and team collaboration.

> **Status:** every service is real, end to end — auth (Firebase-backed sessions), projects (including fork and role-aware delete), the idea clarifier, code insight/code notes, billing and plan quotas, usage tracking, streaming AI code generation, and Kubernetes-backed live previews. See [Status](#status) below.

## Status

17 domain entities are implemented (see [docs/README.md](docs/schema/README.md#entities--models) for the full schema and ER diagram). 11 REST controllers (session auth, legacy auth, projects, ideas, project members, project files, code insight, billing, usage, chat, live previews) exist with their DTOs — see [docs/README.md](docs/api/README.md#apis) for the endpoint list. `AuthController`'s all 3 endpoints (signup, login, and now profile), `ProjectController`'s endpoints (list, get, create, create-from-prompt, update, soft-delete, fork, retry template setup, pin/unpin, star/unstar — list and get responses include the caller's own role on that project, and the list includes when the caller pinned or starred it), `IdeaController`'s both endpoints (clarify an idea, compile the answers into a brief), `ProjectMemberController`'s endpoints (list, invite, accept invite, update role, remove), `FileController`'s four endpoints (file tree, file content, code search, whole-project ZIP download — MinIO-backed via `ProjectFileService`, the file-storage duplication that used to exist here is gone), `BillingController`'s Stripe checkout, plan changes, customer portal, and payment webhook, both `UsageController` endpoints, both `ChatController` endpoints, and `PreviewController`'s live-preview endpoints (start/restart/stop, logs, the caller's active previews) all have real logic — every backend service, including the plan catalogue and enforced quotas, is real as of this pass. Authentication is Firebase-backed sessions (Firebase Authentication + an `httpOnly` session cookie), with stateless JWT kept as a legacy rollback path (Spring Security + JJWT) — every endpoint except `/api/auth/**` (and `/webhooks/**`, for Stripe's own calls) requires a session cookie or a legacy `Bearer` token, and most `Project`/`ProjectMember` endpoints are also role-gated (`@PreAuthorize`, e.g. only the project owner can manage members, owners and editors can delete it, and viewers can only read). A PostgreSQL datasource is configured in `application.yaml`. Billing runs on Stripe. There are three plans — **Free** (1 project, 5,000 AI tokens a day), **Pro** at ₹499/month (3 projects, 100,000 a day) and **Business** at ₹1,499/month (10 projects, 500,000 a day) — on a public **pricing page**, with a **Plans & billing** page showing your plan, when it renews, and live meters for today's tokens and your projects. Upgrading goes through Stripe Checkout and is active the moment you're sent back, even before Stripe's webhook arrives; changing card or cancelling happens in Stripe's own billing portal, and a cancelled plan keeps running until the period you've paid for ends. The limits are real: once today's tokens are spent, the chat composer is replaced by a note saying when the allowance refills and offering an upgrade, and the same happens — before you've answered the idea interview, not after — if you're at your project limit. Subscription state is kept in step by signature-verified Stripe webhooks (renewals, failed payments, cancellations). A **Usage** page shows where your AI tokens go — daily bars stacked by what they were spent on (building, ExplainLLM, the idea interview, naming) with your plan's daily limit drawn across them, the split between what you sent and what the AI wrote, which projects used the most, every individual request, and a CSV export — over today, 7, 30 or 90 days. In a project, a slim token bar above the chat box always shows how much of today's allowance you've used and when it resets; open it for this project's share, what your last reply cost, and your project count. A project doesn't have to start from a blank prompt: the **idea clarifier** interviews the user about whatever they typed, compiles the answers into a project brief, and creates the project under a plain name generated from the idea — so the first thing the code-generation model reads is a spec rather than a one-liner. The questions aren't a fixed questionnaire — they're written for each specific idea. "A todo app" gets asked how tasks should be grouped and how due dates and repeats should work; "a website for my dad's auto repair garage" gets asked how customers schedule a repair and what should prove the shop is reliable. How many questions you get depends on how much the prompt already says: a bare phrase gets four, a paragraph that already names its users and features gets two. Anything the prompt already answers is skipped, and the last question is always about look and feel, since even a detailed brief rarely says what it should look like. Every AI step in that flow has a non-AI fallback (generic questions, a template brief, heuristic naming), so the model being down slows the experience down instead of blocking project creation, and all three of its AI calls count toward the caller's daily token usage. New projects have a starter template (React + Vite + Tailwind + daisyUI) copied into MinIO storage; that copy is idempotent and auto-retried, and a project is always created successfully even if the copy is still incomplete afterward — the incomplete state is surfaced on the project and can be retried manually. A multi-file build reads as progress rather than a wall of text: the AI announces its plan as a checklist up front ("Building the site header", "Wiring header and footer"), and each step ticks off as that file is written. The checklist is as long as the job needs — a one-line fix is a single step, a whole blog section is ten — rather than a fixed-length ceremony — with any step whose file never arrived left visibly unticked. People learning to code can switch on **Teaching Mode** ("Teach me", on the dashboard or in the chat box): every file the AI writes then comes with a walkthrough that goes through it properly — what the file is for, and for each piece of code what it does, why it was written that way rather than another, and what to watch out for. Each walkthrough sits under the build step that wrote its file — the step says what it set out to do, its "How it works" toggle says how the code does it — and stays folded until you open the ones you want. Every explanation points at the exact line it's about: click it and the editor jumps to that line and highlights it, and every step has an arrow straight into the file it wrote. Ideas you've already been taught, across all your projects, are named rather than explained again. With it off, the AI isn't told about walkthroughs at all and it costs nothing; with it on, responses take longer, since the explanations are written as the code is. AI code generation streams a Spring AI `ChatClient` (pointed at an OpenRouter-hosted model) through a custom XML-tag protocol, giving the model a `read_files` tool, the project's file tree, and (when relevant) a notice about incomplete template setup as context, then parses its output into structured chat events, retries an AI-provider rate limit automatically, and writes any generated files to MinIO-backed storage — one file at a time, so one bad file doesn't lose the rest of a generation. If a turn announces an edit but never actually delivers one (a real, if rare, model failure mode), it's automatically retried once before falling back to a clear "wasn't able to finish this" message, instead of silently looking like it succeeded. A long build that stops part-way through its own checklist says so plainly - which steps were left, and whether it ran out of room - and is retried once automatically; you can also stop a response from the composer at any time, and retry one by hand. The project file tree also reports each file's real size, MIME type, and last-modified time now, not placeholder nulls, and a file path resolves the same whether or not it's sent with a leading slash. Reading the code is a first-class part of learning it: selecting any block in the editor offers **Explain** (a plain-language read of what it does) or **Ask** (a conversation about it — what a piece of syntax means, why it's written that way), shown in a panel docked beside the editor so the code stays visible. You don't have to select anything first: ask about the project in general ("where is routing set up?") and it reads the files it needs to answer. It can only read — code notes never change your project. Those notes are read-only, follow the answer as it's written, and are **yours**: each person's thread is saved to their own account, so sharing a project doesn't mean sharing your notes, and they're still there on your next visit. They last until you delete them - bin a single question and its answer from the transcript, or clear the whole thread; copy the whole conversation as markdown or download it first if you want to keep it - the build chat has the same two buttons. Switching a file's diff on jumps straight to the first line that changed, rather than leaving you to find it. Signing out clears everything this browser was holding for you, so sharing a machine doesn't share your work either. The diff for whatever the last chat changed survives a refresh too, so you can always compare a generated file against what was there before it. **Find in files** searches every file in the project and jumps straight to the matching line. The project chat can be exported as markdown too, and a rail down the side of it lists everything you've asked for so you can jump back to any of it - long messages glide into view rather than being cut off. Server logs distinguish client mistakes from server faults: a 404 or a validation failure logs one WARN line, while only genuine server errors (storage unavailable, unexpected exceptions) log at ERROR with a stack trace. Every message carries its time, and an AI reply can be copied as clean markdown — the same shape an exported chat has, not the raw stream — as soon as it finishes; both appear the moment the turn lands rather than on the next refresh. The dashboard shows your four most recent projects, at the same card proportions as the All projects page, and the panel holds one height so switching between All, Owned and Shared never shifts the page under you. Generated files are only written to storage once a whole response finishes, so the editor never asks the server for a file mid-generation: a file being rewritten keeps showing its last version and swaps to the new one in a single step when it's done, the open file is never switched out from under you, and a changed file's marker clears the first time you open it.

## Tech Stack

**Backend**
- **Language:** Java 25
- **Framework:** Spring Boot 4.1.0 (Spring Web MVC, Spring Data JPA, Spring Security)
- **Database:** PostgreSQL
- **Build tool:** Maven (via Maven Wrapper)
- **Other:** Lombok, MapStruct, Bean Validation, Firebase Admin SDK (session-based auth) + JJWT (legacy Bearer-token rollback path), Stripe Java SDK, Spring AI (OpenRouter-hosted model), MinIO Java SDK, fabric8 `kubernetes-client` + Spring Data Redis (Kubernetes-backed live previews), springdoc-openapi (OpenAPI spec + Swagger UI)

**Frontend** (`frontend/`)
- **Framework:** React 18 + TypeScript, Vite 5, `react-router-dom`
- **Styling/UI:** Tailwind CSS + shadcn/ui (Radix UI primitives)
- **State/data:** `@tanstack/react-query`, plus per-feature module stores (chat, code notes) rather than a global state library
- **Editor:** CodeMirror 6, with its own grammars also used for chat code highlighting
- **Auth:** Firebase JS SDK — every sign-in method runs client-side, this backend only verifies the resulting ID token
- **Charts:** Recharts (usage insights)
- **Testing:** Vitest + Testing Library, 270 tests across 27 files

## Data Model

Full ER diagram and entity notes: [docs/README.md](docs/schema/README.md#entities--models)

## API

Full endpoint list: [docs/README.md](docs/api/README.md#apis)

## Getting Started

Requires a local PostgreSQL instance matching `application.yaml`'s `spring.datasource` block, and a local MinIO instance for file storage. The easiest way to get both: `docker compose -f services.docker-compose.yml up -d` (Postgres on port 9010, MinIO API on 9000 / console on 9001, plus Mailpit for password-reset emails at http://localhost:8025). Sign-in is Firebase Authentication — `POST /api/auth/session` with a Firebase ID token gets you a session cookie, and `JWT_SECRET` still needs to be set for the legacy `POST /api/auth/signup`/`login` rollback path (`app.auth.legacy.enabled`), which returns a `Bearer` token instead. Every secret in `application.yaml` is an env var with **no** committed fallback, so the app won't start until they're set: `DB_USERNAME`/`DB_PASSWORD` (the docker-compose Postgres uses `user`/`password`), `JWT_SECRET` (any long random string), and `FIREBASE_PROJECT_ID`/`FIREBASE_CREDENTIALS_PATH` (a Firebase project and a service-account key file **outside** this repo) at minimum. To exercise Stripe checkout/portal/webhooks, set `STRIPE_SECRET`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO` and `STRIPE_PRICE_BUSINESS` to real values from your own Stripe account — unlike the JWT/DB settings, the committed defaults are placeholders, not a working fallback. Same for AI chat: set `OPENROUTER_API_KEY` to a real OpenRouter API key. `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` have no committed fallback either — set them to match whatever you run MinIO with locally (the docker-compose file above uses `minioadmin`/`minioadmin123`).

The simplest way to set any of these locally: create a `.env` file in the project root (gitignored, never pushed) with one `KEY=value` per line — `application.yaml` loads it automatically via `spring.config.import`, no extra setup needed.

```bash
./mvnw spring-boot:run
```

On Windows, use `mvnw.cmd` instead of `./mvnw`.

For live previews, the local dev cluster (`k8s/`) needs a running Kubernetes cluster (e.g. `kind`) with the manifests in `k8s/` applied and Redis reachable — either directly, or forwarded to `localhost:6379` (`k8s/dev-port-forward.sh`/`.ps1`, or set `preview.port-forward.enabled: true` to have the backend do it itself). Without that, every other feature still works; only starting a preview fails.

The frontend is a separate Vite app in `frontend/`:

```bash
cd frontend
npm install
npm run dev
```

It expects the backend on `http://localhost:8080` and Firebase config in `frontend/.env.local` (see `frontend/.env.example`).

### Tests

```bash
./mvnw test -Dtest=IdeaServiceImplTest,LlmResponseParserTest,PromptUtilsTest,CodeSearchScannerTest
```

The backend suite is `IdeaServiceImplTest` (the adaptive interview's non-AI logic), `CodeSearchScannerTest` (code search's literal, case-insensitive line matching), `LlmResponseParserTest` (the AI's XML-tag protocol, including the build checklist and Teaching Mode walkthroughs), `PromptUtilsTest` (what Teaching Mode adds to the system prompt, and that it adds nothing when off), plus the generated `contextLoads` smoke test. Run the named tests rather than the whole suite: `contextLoads` needs a live database and can't start on a JVM reporting the legacy `Asia/Calcutta` timezone alias, so a bare `./mvnw test` fails for reasons unrelated to the code under test.

Frontend tests live in `frontend/`:

```bash
npm test
```

## Project Structure

```
src/main/java/com/java/vibecraft/entity/       JPA entities
src/main/java/com/java/vibecraft/enums/        domain enums
src/main/java/com/java/vibecraft/repository/   Spring Data JPA repositories
src/main/java/com/java/vibecraft/mapper/       MapStruct entity<->DTO mappers
src/main/java/com/java/vibecraft/error/        global exception handling
src/main/java/com/java/vibecraft/security/     Firebase session auth (+ legacy JWT rollback), rate limiting, role-based authorization (Spring Security config, filters, token/session utils, @PreAuthorize expressions)
src/main/java/com/java/vibecraft/config/       Stripe/MinIO/Spring AI/CORS/Kubernetes/Redis bean configuration
src/main/java/com/java/vibecraft/llm/          AI code-generation prompt, response parsing, tools, advisors, teaching mode, code-insight prompts, project naming, token-usage recording
src/main/java/com/java/vibecraft/controller/   REST controllers
src/main/java/com/java/vibecraft/service/      service interfaces
src/main/java/com/java/vibecraft/service/impl/ service implementations (all real, including live previews)
src/main/java/com/java/vibecraft/dto/          request/response records, by domain
src/main/java/com/java/vibecraft/util/         small shared helpers (content-type detection, code-search line matching, duration formatting)
src/main/resources/application.yaml              configuration

frontend/src/components/     React components - UI primitives in ui/, feature components everywhere else
frontend/src/components/ui/  vendored shadcn/ui primitives (Radix UI + Tailwind variants)
frontend/src/pages/          top-level routed pages
frontend/src/hooks/          custom React hooks
frontend/src/lib/            API client, SSE/stream parsing, and other framework-free logic (most of it directly unit-tested)

k8s/                         Kubernetes manifests for the live-preview runner pool and proxy (kind/local-dev oriented)
proxy/                       the standalone Node reverse proxy that routes preview hostnames to runner pods via Redis
```

## Documentation

- [docs/README.md](docs/README.md) — tech stack, practices, APIs, entities, and ER diagram reference.
- [CLAUDE.md](CLAUDE.md) — guidance for AI coding assistants working in this repo.
