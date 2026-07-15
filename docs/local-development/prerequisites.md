# Prerequisites

- Java 25, Maven Wrapper (bundled — don't install Maven separately, use `mvnw`/`mvnw.cmd`)
- Node.js (for `frontend/`) and `npm` — `package-lock.json` is the lockfile actually used; a `bun.lockb` exists locally but is gitignored and not what CI/anyone else installs with
- Docker (Postgres + MinIO + Mailpit via `services.docker-compose.yml`)
- Optional, only for live previews: a local Kubernetes cluster (`kind` is what this project's own manifests target) and `kubectl`
- Accounts/keys: a Firebase project (Authentication enabled), an OpenRouter API key, a Stripe test-mode account (only needed for billing)
