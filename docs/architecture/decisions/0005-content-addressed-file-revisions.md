# 0005. Content-addressed, atomic file revisions

**Status:** Accepted

## Context

AI turns originally wrote each file directly over its previous version in MinIO, one call per file. A failure partway through left a project half-updated, there was no history to return to, and two concurrent writers could interleave. Restoring an earlier state of a project was impossible.

## Decision

Every change set is published as one immutable revision through a four-step pipeline in workspace-service:

1. **Stage** new content into a separate bucket, keyed by its SHA-256 (immutable, deduplicated).
2. **Record a manifest** — the revision and one entry per path, including each path's previous hash.
3. **Apply** the entries onto the live file keys, rolling back everything already applied if any step fails.
4. **Publish** with a compare-and-swap on the project's current revision, so concurrent publishers serialize to one winner.

An AI turn publishes one revision through a single internal API call. Restoring an old revision publishes the diff back to it as a new revision, through the same pipeline.

## Consequences

- A turn's file changes land completely or not at all, and a failed write is never recorded as a success in the chat history.
- History is forward-only; nothing is ever rewritten.
- The live key layout is unchanged, so every existing reader — including the preview pods' file sync — works as before.
- Blobs are never deleted, so storage grows until garbage collection is added.
- A process crash between apply steps can leave a revision in `STAGING`; there is no automatic reconciliation yet.
- The transactional behaviour is covered by a Testcontainers integration test against real Postgres and MinIO — the one place the backend tests use real infrastructure.

Design details: [File revisions](../file-revisions.md).
