# Files

## `FileController` (`/api/projects/{projectId}/files`)

*Owner: `workspace-service`.*

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/files` | — | `FileTreeResponse` | Every `ProjectFile` row for the project. |
| GET | `/files/content?path=` | — | `FileContentResponse` | Path is normalized before building the MinIO key, so a leading `/` doesn't 404 a file that exists. 404 if genuinely missing. Not called by the frontend for a file mid-generation. |
| GET | `/files/search?q=` | — | `CodeSearchResponse` | **Literal substring match, not regex** — deliberately, since people search for things like `useState(` where regex metacharacters would silently mean something else. Case-insensitive, capped at 50 matches/file and 300 overall (`truncated` flags a capped result). Binaries and files over 1MB are skipped without a storage read. |
| GET | `/files/download-zip` | — | `application/zip` | Built in memory from every `ProjectFile` row; a storage object missing is skipped (logged), any other storage failure is a 503. |

All four require project `VIEW` — any member, whatever their role — and answer 403 to anyone else. The tree and content reads are guarded on `FileController` itself; search and zip on `ProjectFileService`, because `InternalWorkspaceController` also calls that service as a machine caller with no user to check (see `docs/architecture/cross-cutting-concerns.md` §7).

There is no endpoint to write a file directly. Files change only by publishing a revision: an AI turn does it through the internal API ([`POST /internal/v1/projects/{id}/revisions`](internal.md#internal-api-service-to-service)), which the Gateway never routes, and a user does it by restoring an earlier revision (below).
