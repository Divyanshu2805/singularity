# Key Abstractions

The domain concepts worth knowing by name before reading the code.

| Concept | Service | What it is |
|---|---|---|
| **`Project`** | workspace | The thing being built. It has no `owner` field: ownership is a `ProjectMember` row with `projectRole = OWNER`. See [ownership](../schema/conventions.md#ownership-lives-on-the-join-row-not-a-foreign-key). |
| **`ProjectMember`** | workspace | A user's role (`OWNER`, `EDITOR`, `VIEWER`) on one project. There is no platform-wide role. |
| **`ProjectFile`** | workspace | File *metadata*. The bytes live in MinIO, under a key built by `ProjectFilePath`. Only workspace-service touches MinIO; everyone else goes through its internal API. |
| **Revision** | workspace | One atomic, immutable change set to a project's files (`ProjectFileRevision` plus its entries). Every AI turn and every restore publishes one. See [File revisions](file-revisions.md). |
| **`Preview` vs. `PreviewSession`** | workspace | A `Preview` is one shared runner pod per project; a `PreviewSession` is one collaborator's use of it. The split means one person stopping their view doesn't take the preview away from someone else still watching. |
| **`ChatEvent`** | intelligence | The unit of "what the AI did" in a turn: a thought, a message, a checklist step, a file edit or delete, a teaching-mode walkthrough, or a tool-call log. |
| **`UsageLog` vs. `UsageEvent`** | intelligence | A daily per-user counter (the quota hot path) and an append-only ledger (the insights cold path), written together in one transaction and deliberately kept separate. |
| **`ProjectFileReader`** | intelligence | The *read-only* view of a project's files that the code-insight pipeline is typed against, so it cannot gain a write path by accident. See [AI prompt boundaries](security-model.md#ai-prompt-boundaries). |
| **Plan** | account | A billing tier with limits: owned projects, daily AI tokens, concurrent previews. The effective plan (with the free-tier fallback) is served to other services over the internal API. |
