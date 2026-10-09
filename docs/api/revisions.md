# Revisions

A project's file history and restore. **Service:** workspace-service · **Controller:** `ProjectRevisionController` (`/api/projects/{projectId}/revisions`)

> These endpoints are complete and tested, but the frontend doesn't use them yet.

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `GET` | `/revisions` | — | `List<RevisionSummaryResponse { id, parentRevisionId, status, source, createdByUserId, createdAt, appliedAt, changedPaths }>` | Newest first, including `FAILED` and `CONFLICT` revisions. `source` is `AI_GENERATION`, `MANUAL_EDIT` or `RESTORE`; `changedPaths` are the files that revision touched. Project `VIEW`. |
| `GET` | `/revisions/{revisionId}/preview?before=` | — | `RevisionPreviewResponse { revisionId, changes: [{ path, kind: ADDED \| MODIFIED \| DELETED }] }` | What restoring to that revision would change, relative to the current files - or, with `before=true`, what restoring to the project as it stood just before that revision would change. Read-only. Project `VIEW`. |
| `POST` | `/revisions/{revisionId}/restore?before=` | — | `PublishRevisionResponse { revisionId, status: APPLIED \| FAILED \| CONFLICT, currentRevisionId, failedPaths, previousContent }` | Publishes the difference as a new, forward-only `RESTORE` revision through the same all-or-nothing pipeline as an AI write; history is never rewritten. A lost race is reported as `status: CONFLICT`, not an HTTP error. Project `EDIT`. |

## Behavior

- **Preview and restore answer `404` unless the revision belongs to this project and is `APPLIED`.** Revision ids are sequential, and the role check only proves access to the project in the path, so without this check an editor of one project could restore another project's files into theirs.
- A file that hasn't been touched since revisions were introduced has no stored hash, so it is reported as `MODIFIED` rather than silently skipped.

- **`before=true` is the chat's Undo.** A saved turn carries the revision its files were published as (`revisionId` on the [chat history](chat.md)); restoring to before it puts back exactly what that turn changed and everything after it. It works on a project's first revision too.
- **A file no revision has ever changed is left alone.** The starter template's files have no revision of their own, so a restore neither deletes them nor reports them; a template file first changed after the restore point goes back to what it first contained.

See [File revisions](../architecture/file-revisions.md) for how publishing and restoring work.
