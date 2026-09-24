# Contributing to VibeCraft

## Before you start

- Get the stack running locally: [local development](docs/local-development/README.md).
- Skim the [architecture overview](docs/architecture/README.md) to find which service owns the behaviour you're changing, and [where do I change…?](docs/architecture/where-to-change.md) to find the code.
- Read the [security guardrails](docs/practices/security-guardrails.md). Changes that weaken one are not accepted as a workaround; raise the problem instead.

## Workflow

1. Branch from `main`, one short-lived branch per change (`feat/…`, `fix/…`, `docs/…`).
2. Make the change, with tests (see [testing](docs/practices/testing.md)), and try it locally ([local development](docs/local-development/README.md)).
3. Run the checks below.
4. Open a pull request against `main`. CI runs the backend, frontend and proxy test suites on every pull request; pull requests never deploy and never see secrets. `main` accepts changes only through a pull request whose checks pass.
5. Merge. The merge builds the images, then waits for the owner to approve the production deploy ([the release gate](docs/deployment/ci-cd.md#the-release-gate)).

## Checks

```bash
# Backend — the tests you touched, plus the route table if an endpoint changed
./mvnw -pl common-lib,<service> test -Dtest=<TestClass>
./mvnw -pl gateway-service test -Dtest=RoutingTableTest

# Prove the service still starts
./mvnw -pl <service> spring-boot:run

# Frontend
cd frontend && npx tsc --noEmit && npm run lint && npm test && npm run build
```

The full checklist is the [definition of done](docs/practices/definition-of-done.md).

## Conventions

- **Code style** — see [coding conventions](docs/practices/coding-conventions.md). In short: controllers → services → repositories; request DTOs are validated records; errors are typed exceptions; each source file opens with one header comment and has no other comments.
- **Schema changes** are new Flyway migrations, never edits to applied ones ([changing the schema](docs/schema/conventions.md#changing-the-schema)).
- **Secrets** are environment variables with no default. Never commit `.env`, `.env.local` or credential files.
- **Docs** — a change that makes any page in `docs/` inaccurate updates it in the same pull request.

## Commit messages

One line, in [Conventional Commits](https://www.conventionalcommits.org/) style:

```
feat: stream code-insight answers
fix: keep the preview token out of the iframe src
docs(api): document the revisions endpoints
chore: bump Spring Boot to 4.1.1
```

Common types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. An optional scope names the area.

## Known pitfalls

Several traps in this stack fail silently — a mismatched `@PreAuthorize` parameter name, a bean outside the scan root, a stale `common-lib` jar. If something "should work" but doesn't, check [known pitfalls](docs/practices/gotchas/README.md) first.
