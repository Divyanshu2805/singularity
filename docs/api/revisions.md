# Revisions

## `ProjectRevisionController` (`/api/projects/{projectId}/revisions`)

*Owner: `workspace-service`. Not called by the frontend yet — the checkpoint list and preview-before-restore screen that will use it aren't built.*

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/revisions` | — | `List<RevisionSummaryResponse { id, parentRevisionId, status, source, createdByUserId, createdAt, appliedAt }>` | Newest first. Every revision, including `FAILED`/`CONFLICT` ones. Project `VIEW`. |
| GET | `/revisions/{revisionId}/preview` | — | `RevisionPreviewResponse { revisionId, changes: [{ path, kind: ADDED \| MODIFIED \| DELETED }] }` | What restoring to that revision would change, relative to the current files. Read-only. Project `VIEW`. |
| POST | `/revisions/{revisionId}/restore` | — | `PublishRevisionResponse { revisionId, status: APPLIED \| FAILED \| CONFLICT, currentRevisionId, failedPaths, previousContent }` | Publishes that diff as a new, forward-only `RESTORE` revision through the same all-or-nothing pipeline as an AI write — history is never rewritten. A lost race comes back as `status: CONFLICT`, not an HTTP error. Project `EDIT`. |

Preview and restore answer **404 unless `revisionId` belongs to this project and is `APPLIED`**. The `@PreAuthorize` guard only proves access to the project in the path, and revision ids are sequential, so without that check an editor of their own project could restore another project's files into it and read them. A file untouched since revisions shipped has no stored hash and is reported `MODIFIED` rather than silently skipped. See `docs/schema/conventions.md`'s "Revision manifests" for how publishing works.
