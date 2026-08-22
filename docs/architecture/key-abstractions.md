# 5. Key Abstractions

- **`Project`** — the workspace being built (workspace-service). No `owner` field; ownership is `ProjectMember.projectRole == OWNER`. See `docs/schema/`.
- **`ChatEvent`** — the unit of "what the AI did" in one turn (intelligence-service): a thought, a message, a checklist step, a file edit or delete, a teaching-mode walkthrough, or a tool-call log. There is no separate "checkpoint" or file-version concept — see `docs/schema/`'s "No checkpoint/rollback system."
- **`Preview` vs. `PreviewSession`** — a `Preview` is one shared Kubernetes pod per project; a `PreviewSession` is one collaborator's use of it. This split exists specifically so one person stopping their view doesn't take the preview away from someone else still looking at it.
- **`ProjectFile`** — a database row is metadata only; the actual bytes live in MinIO, keyed by `ProjectFileServiceImpl.objectKey(projectId, path)`. Only workspace-service touches MinIO; everyone else goes through its internal API.
- **`UsageLog` vs. `UsageEvent`** — a daily counter (the quota hot path) and an append-only ledger (the insights/breakdown cold path), written together in one transaction and deliberately not collapsed into one table — see `docs/schema/`.
- **`ProjectFileReader`** — intelligence-service's *read-only* view of a project's files. The build pipeline holds the full write-capable `WorkspaceServiceClient`; the code-insight pipeline is typed against `ProjectFileReader` alone, so it cannot gain a write path by accident (§6).
