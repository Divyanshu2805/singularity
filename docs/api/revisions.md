# Revisions

A project's file history and restore. **Service:** workspace-service · **Controller:** `ProjectRevisionController` (`/api/projects/{projectId}/revisions`)

> These endpoints are complete and tested, but the frontend doesn't use them yet.

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `GET` | `/revisions` | — | `List<RevisionSummaryResponse { id, parentRevisionId, status, source, createdByUserId, createdAt, appliedAt }>` | Newest first, including `FAILED` and `CONFLICT` revisions. Project `VIEW`. |
| `GET` | `/revisions/{revisionId}/preview` | — | `RevisionPreviewResponse { revisionId, changes: [{ path, kind: ADDED \| MODIFIED \| DELETED }] }` | What restoring to that revision would change, relative to the current files. Read-only. Project `VIEW`. |
| `POST` | `/revisions/{revisionId}/restore` | — | `PublishRevisionResponse { revisionId, status: APPLIED \| FAILED \| CONFLICT, currentRevisionId, failedPaths, previousContent }` | Publishes the difference as a new, forward-only `RESTORE` revision through the same all-or-nothing pipeline as an AI write; history is never rewritten. A lost race is reported as `status: CONFLICT`, not an HTTP error. Project `EDIT`. |

## Behavior

- **Preview and restore answer `404` unless the revision belongs to this project and is `APPLIED`.** Revision ids are sequential, and the role check only proves access to the project in the path, so without this check an editor of one project could restore another project's files into theirs.
- A file that hasn't been touched since revisions were introduced has no stored hash, so it is reported as `MODIFIED` rather than silently skipped.

See [File revisions](../architecture/file-revisions.md) for how publishing and restoring work.
