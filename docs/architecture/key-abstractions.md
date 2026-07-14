# 4. Key Abstractions

- **`Project`** — the workspace being built. No `owner` field; ownership is `ProjectMember.projectRole == OWNER`. See `docs/schema/`.
- **`ChatEvent`** — the unit of "what the AI did" in one turn: a thought, a message, a checklist step, a file edit, a teaching-mode walkthrough, or a tool-call log. There is no separate "checkpoint" or file-version concept — see `docs/schema/conventions.md`'s "No checkpoint/rollback system."
- **`Preview` vs. `PreviewSession`** — a `Preview` is one shared Kubernetes pod per project; a `PreviewSession` is one collaborator's use of it. This split exists specifically so one person stopping their view doesn't take the preview away from someone else still looking at it.
- **`ProjectFile`** — a database row is metadata only; the actual bytes live in MinIO, keyed by `ProjectFileServiceImpl.objectKey(projectId, path)`.
- **`UsageLog` vs. `UsageEvent`** — a daily counter (the quota hot path) and an append-only ledger (the insights/breakdown cold path), written together in one transaction and deliberately not collapsed into one table — see `docs/schema/`.
