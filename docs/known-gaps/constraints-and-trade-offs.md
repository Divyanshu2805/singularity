# 7. Known Constraints & Trade-offs

This section intentionally stays short — the honest, itemized list of gaps, open design questions, and deferred work lives in **`TODO.md`** (gitignored, not duplicated here) so there's exactly one place that can go stale. Read it before assuming something here is either "done" or "broken." A few structural trade-offs worth knowing before you extend this system, because they shape *how* you'd extend it rather than *whether* something works today:

- **Live previews are single-stack (React + Vite) by infrastructure choice, not by hard architectural necessity.** The pod pool, bootstrapper, and Redis routing are almost entirely generic; only the pod image, boot script, readiness probe, and port are React/Vite-specific. See `TODO.md`'s "Multi-runtime / multi-stack preview support" for the actual shape of what changing this would take.
- **No schema migration tool.** `ddl-auto: update` only creates/widens — it's the direct cause of the recurring persisted-enum trap (`docs/schema/`). Any serious extension to this schema should probably introduce Flyway or Liquibase rather than keep relying on manual `\d <table>` checks.
- **No automated coverage of the two highest-blast-radius subsystems**: the Kubernetes/Redis-backed live-preview pipeline, and Stripe billing end-to-end. Both are verified by hand today.
