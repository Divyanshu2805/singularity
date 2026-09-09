# Architecture Decisions

Short records of the decisions that shape VibeCraft, each with the context that forced it and the trade-offs it accepts. They explain *why* the system looks the way it does; the rest of the architecture docs explain *what* it is.

| # | Decision | Status |
|---|---|---|
| [0001](0001-microservices-with-database-per-service.md) | Split the backend into three domain services, each owning its database | Accepted |
| [0002](0002-firebase-identity-with-server-sessions.md) | Use Firebase as the only identity provider, with server-issued session cookies | Accepted |
| [0003](0003-run-generated-code-only-in-runner-pods.md) | Run generated code only in Kubernetes runner pods | Accepted |
| [0004](0004-tag-based-generation-protocol.md) | Stream AI output in a tag-based protocol instead of structured output | Accepted |
| [0005](0005-content-addressed-file-revisions.md) | Publish every file change as a content-addressed, atomic revision | Accepted |
| [0006](0006-flyway-owned-schemas.md) | Let Flyway own every schema, with no enum `CHECK` constraints | Accepted |
| [0007](0007-single-node-k3s-deployment.md) | Deploy to a single k3s node behind a tunnel, with portable manifests | Accepted |

## Writing a new record

Add a file named `NNNN-short-title.md` with the next number, using the same sections as the existing records: **Status**, **Context**, **Decision**, **Consequences**. Once a record is accepted, don't rewrite it; if a decision changes, add a new record that supersedes it and update the old one's status.
