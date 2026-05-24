# VibeCraft

An AI-assisted project-building platform: create projects, build them via AI chat, get live previews, and collaborate with your team.

> **Status:** early stage. Signup/login, all 5 project endpoints, all 5 project-member endpoints, both project-file endpoints, Stripe checkout + customer portal + webhooks, and streaming AI code generation do real work; everything else is still a stub — see [Status](#status) below.

## Status

11 domain entities are implemented (see [docs/README.md](docs/schema/README.md#entities--models) for the full schema and ER diagram). 7 REST controllers (auth, projects, project members, project files, billing, usage, chat) exist with their DTOs — see [docs/README.md](docs/api/README.md#apis) for the endpoint list. `AuthController`'s signup/login, `ProjectController`'s endpoints (list, get, create, update, soft-delete), `ProjectMemberController`'s endpoints (list, invite, accept invite, update role, remove), `FileController`'s both endpoints (file tree, file content — MinIO-backed via `ProjectFileService`, the file-storage duplication that used to exist here is gone), `BillingController`'s Stripe checkout, customer portal, and payment webhook, and both `ChatController` endpoints all have real logic; every other endpoint is still a stub. Authentication is real, stateless JWT (Spring Security + JJWT) — every endpoint except `/api/auth/**` (and `/webhooks/**`, for Stripe's own calls) requires a `Bearer` token, and most `Project`/`ProjectMember` endpoints are also role-gated (`@PreAuthorize`, e.g. only the project owner can delete it or manage members). A PostgreSQL datasource is configured in `application.yaml`. Billing runs on Stripe (Checkout Sessions + signature-verified webhooks) — `SubscriptionService` tracks subscription lifecycle state (activation, renewal, cancellation, past-due) driven by Stripe webhook events, and gates project creation against the caller's plan. New projects have a starter template (React + Vite + Tailwind + daisyUI) copied into MinIO storage; that copy is idempotent and auto-retried, and a project is always created successfully even if the copy is still incomplete afterward — the incomplete state is surfaced on the project and can be retried manually. AI code generation streams a Spring AI `ChatClient` (pointed at an OpenRouter-hosted model) through a custom XML-tag protocol, giving the model a `read_files` tool, the project's file tree, and (when relevant) a notice about incomplete template setup as context, then parses its output into structured chat events, retries an AI-provider rate limit automatically, and writes any generated files to MinIO-backed storage — one file at a time, so one bad file doesn't lose the rest of a generation. If a turn announces an edit but never actually delivers one (a real, if rare, model failure mode), it's automatically retried once before falling back to a clear "wasn't able to finish this" message, instead of silently looking like it succeeded. The project file tree also reports each file's real size, MIME type, and last-modified time now, not placeholder nulls.

## Tech Stack

- **Language:** Java 25
- **Framework:** Spring Boot 4.1.0 (Spring Web MVC, Spring Data JPA, Spring Security)
- **Database:** PostgreSQL
- **Build tool:** Maven (via Maven Wrapper)
- **Other:** Lombok, MapStruct, Bean Validation, JJWT, Stripe Java SDK, Spring AI (OpenRouter-hosted model), MinIO Java SDK

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
./mvnw test
```

## Project Structure

```
src/main/java/com/java/vibecraft/entity/       JPA entities
src/main/java/com/java/vibecraft/enums/        domain enums
src/main/java/com/java/vibecraft/repository/   Spring Data JPA repositories
src/main/java/com/java/vibecraft/mapper/       MapStruct entity<->DTO mappers
src/main/java/com/java/vibecraft/error/        global exception handling
src/main/java/com/java/vibecraft/security/     JWT auth + role-based authorization (Spring Security config, filter, token utils, @PreAuthorize expressions)
src/main/java/com/java/vibecraft/config/       Stripe/MinIO/Spring AI bean configuration
src/main/java/com/java/vibecraft/llm/          AI code-generation prompt, response parsing, tools, advisors
src/main/java/com/java/vibecraft/controller/   REST controllers
src/main/java/com/java/vibecraft/service/      service interfaces
src/main/java/com/java/vibecraft/service/impl/ service implementations (mostly stubs)
src/main/java/com/java/vibecraft/dto/          request/response records, by domain
src/main/java/com/java/vibecraft/util/         small shared helpers (e.g. content-type detection)
src/main/resources/application.yaml              configuration
```

## Documentation

- [docs/README.md](docs/README.md) — tech stack, practices, APIs, entities, and ER diagram reference.
- [CLAUDE.md](CLAUDE.md) — guidance for AI coding assistants working in this repo.
