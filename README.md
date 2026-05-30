# VibeCraft

An AI-assisted project-building platform: describe an idea, answer a few questions about it, and get a project built for you via AI chat — with live previews and team collaboration.

> **Status:** early stage. Signup/login/profile, all 11 project endpoints, both idea-clarifier endpoints, all 5 project-member endpoints, all 4 project-file endpoints, both code-insight endpoints, Stripe checkout + customer portal + webhooks, both usage endpoints, and streaming AI code generation do real work; only the plans endpoint is still a stub — see [Status](#status) below.

## Status

11 domain entities are implemented (see [docs/README.md](docs/schema/README.md#entities--models) for the full schema and ER diagram). 9 REST controllers (auth, projects, ideas, project members, project files, code insight, billing, usage, chat) exist with their DTOs — see [docs/README.md](docs/api/README.md#apis) for the endpoint list. `AuthController`'s all 3 endpoints (signup, login, and now profile), `ProjectController`'s endpoints (list, get, create, create-from-prompt, update, soft-delete, retry template setup, pin/unpin, star/unstar — list and get responses include the caller's own role on that project, and the list includes when the caller pinned or starred it), `IdeaController`'s both endpoints (clarify an idea, compile the answers into a brief), `ProjectMemberController`'s endpoints (list, invite, accept invite, update role, remove), `FileController`'s four endpoints (file tree, file content, code search, whole-project ZIP download — MinIO-backed via `ProjectFileService`, the file-storage duplication that used to exist here is gone), `BillingController`'s Stripe checkout, customer portal, and payment webhook, both `UsageController` endpoints, and both `ChatController` endpoints all have real logic; only the plans endpoint is still a stub. Authentication is real, stateless JWT (Spring Security + JJWT) — every endpoint except `/api/auth/**` (and `/webhooks/**`, for Stripe's own calls) requires a `Bearer` token, and most `Project`/`ProjectMember` endpoints are also role-gated (`@PreAuthorize`, e.g. only the project owner can delete it or manage members). A PostgreSQL datasource is configured in `application.yaml`. Billing runs on Stripe (Checkout Sessions + signature-verified webhooks) — `SubscriptionService` tracks subscription lifecycle state (activation, renewal, cancellation, past-due) driven by Stripe webhook events, and gates project creation against the caller's plan. A project doesn't have to start from a blank prompt: the **idea clarifier** interviews the user about whatever they typed, compiles the answers into a project brief, and creates the project under a plain name generated from the idea — so the first thing the code-generation model reads is a spec rather than a one-liner. The questions aren't a fixed questionnaire — they're written for each specific idea. "A todo app" gets asked how tasks should be grouped and how due dates and repeats should work; "a website for my dad's auto repair garage" gets asked how customers schedule a repair and what should prove the shop is reliable. How many questions you get depends on how much the prompt already says: a bare phrase gets four, a paragraph that already names its users and features gets two. Anything the prompt already answers is skipped, and the last question is always about look and feel, since even a detailed brief rarely says what it should look like. Every AI step in that flow has a non-AI fallback (generic questions, a template brief, heuristic naming), so the model being down slows the experience down instead of blocking project creation, and all three of its AI calls count toward the caller's daily token usage. New projects have a starter template (React + Vite + Tailwind + daisyUI) copied into MinIO storage; that copy is idempotent and auto-retried, and a project is always created successfully even if the copy is still incomplete afterward — the incomplete state is surfaced on the project and can be retried manually. A multi-file build reads as progress rather than a wall of text: the AI announces its plan as a checklist up front ("Building the site header", "Wiring header and footer"), and each step ticks off as that file is written. The checklist is as long as the job needs — a one-line fix is a single step, a whole blog section is ten — rather than a fixed-length ceremony — with any step whose file never arrived left visibly unticked. People learning to code can switch on **Teaching Mode** ("Teach me", on the dashboard or in the chat box): every file the AI writes then comes with a walkthrough — what the file is for, an explanation of each important piece of code in plain English, and which other files it works with. Walkthroughs stay folded under each file's "How it works" toggle until you open the ones you want, and every explanation points at the exact line it's about: click it and the editor jumps to that line and highlights it. Ideas you've already been taught, across all your projects, are named rather than explained again. With it off, the AI isn't told about walkthroughs at all and it costs nothing; with it on, responses take longer, since the explanations are written as the code is. AI code generation streams a Spring AI `ChatClient` (pointed at an OpenRouter-hosted model) through a custom XML-tag protocol, giving the model a `read_files` tool, the project's file tree, and (when relevant) a notice about incomplete template setup as context, then parses its output into structured chat events, retries an AI-provider rate limit automatically, and writes any generated files to MinIO-backed storage — one file at a time, so one bad file doesn't lose the rest of a generation. If a turn announces an edit but never actually delivers one (a real, if rare, model failure mode), it's automatically retried once before falling back to a clear "wasn't able to finish this" message, instead of silently looking like it succeeded. The project file tree also reports each file's real size, MIME type, and last-modified time now, not placeholder nulls, and a file path resolves the same whether or not it's sent with a leading slash. Reading the code is a first-class part of learning it: selecting any block in the editor offers **Explain** (a plain-language read of what it does) or **Ask** (a conversation about it — what a piece of syntax means, why it's written that way), shown in a panel docked beside the editor so the code stays visible. You don't have to select anything first: ask about the project in general ("where is routing set up?") and it answers from the project's file list. Those notes are read-only, survive a page refresh, and last until you close the tab; export them as markdown to keep them. **Find in files** searches every file in the project and jumps straight to the matching line. The project chat can be exported as markdown too. Server logs distinguish client mistakes from server faults: a 404 or a validation failure logs one WARN line, while only genuine server errors (storage unavailable, unexpected exceptions) log at ERROR with a stack trace. Generated files are only written to storage once a whole response finishes, so the editor never asks the server for a file mid-generation: a file being rewritten keeps showing its last version and swaps to the new one in a single step when it's done, the open file is never switched out from under you, and a changed file's marker clears the first time you open it.

## Tech Stack

- **Language:** Java 25
- **Framework:** Spring Boot 4.1.0 (Spring Web MVC, Spring Data JPA, Spring Security)
- **Database:** PostgreSQL
- **Build tool:** Maven (via Maven Wrapper)
- **Other:** Lombok, MapStruct, Bean Validation, JJWT, Stripe Java SDK, Spring AI (OpenRouter-hosted model), MinIO Java SDK, springdoc-openapi (OpenAPI spec + Swagger UI)

## Data Model

Full ER diagram and entity notes: [docs/README.md](docs/schema/README.md#entities--models)

## API

Full endpoint list: [docs/README.md](docs/api/README.md#apis)

## Getting Started

Requires a local PostgreSQL instance matching `application.yaml`'s `spring.datasource` block, and a local MinIO instance for file storage. The easiest way to get both: `docker compose -f services.docker-compose.yml up -d` (Postgres on port 9010, MinIO API on 9000 / console on 9001). Create a user via `POST /api/auth/signup`, then get a token via `POST /api/auth/login` — every other endpoint requires it as a `Bearer` token. Override the JWT signing key via the `JWT_SECRET` env var if you don't want the committed local-dev fallback. To exercise Stripe checkout/portal/webhooks, set `STRIPE_SECRET` and `STRIPE_WEBHOOK_SECRET` to real values from your own Stripe account — unlike the JWT/DB settings, the committed defaults are placeholders, not a working fallback. Same for AI chat: set `OPENROUTER_API_KEY` to a real OpenRouter API key. `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` have no committed fallback either — set them to match whatever you run MinIO with locally (the docker-compose file above uses `minioadmin`/`minioadmin123`).

The simplest way to set any of these locally: create a `.env` file in the project root (gitignored, never pushed) with one `KEY=value` per line — `application.yaml` loads it automatically via `spring.config.import`, no extra setup needed.

```bash
./mvnw spring-boot:run
```

On Windows, use `mvnw.cmd` instead of `./mvnw`.

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
src/main/java/com/java/vibecraft/security/     JWT auth + role-based authorization (Spring Security config, filter, token utils, @PreAuthorize expressions)
src/main/java/com/java/vibecraft/config/       Stripe/MinIO/Spring AI/CORS bean configuration
src/main/java/com/java/vibecraft/llm/          AI code-generation prompt, response parsing, tools, advisors, teaching mode, code-insight prompts, project naming, token-usage recording
src/main/java/com/java/vibecraft/controller/   REST controllers
src/main/java/com/java/vibecraft/service/      service interfaces
src/main/java/com/java/vibecraft/service/impl/ service implementations (all real except PlanServiceImpl)
src/main/java/com/java/vibecraft/dto/          request/response records, by domain
src/main/java/com/java/vibecraft/util/         small shared helpers (content-type detection, code-search line matching)
src/main/resources/application.yaml              configuration
```

## Documentation

- [docs/README.md](docs/README.md) — tech stack, practices, APIs, entities, and ER diagram reference.
- [CLAUDE.md](CLAUDE.md) — guidance for AI coding assistants working in this repo.
