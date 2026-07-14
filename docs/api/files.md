# Files

## `FileController` (`/api/projects/{projectId}/files`)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/files` | — | `FileTreeResponse` | Every `ProjectFile` row for the project. |
| GET | `/files/content?path=` | — | `FileContentResponse` | Path is normalized before building the MinIO key, so a leading `/` doesn't 404 a file that exists. 404 if genuinely missing. Not called by the frontend for a file mid-generation — see `docs/architecture/`'s streaming notes. |
| GET | `/files/search?q=` | — | `CodeSearchResponse` | **Literal substring match, not regex** — deliberately, since people search for things like `useState(` where regex metacharacters would silently mean something else. Case-insensitive, capped at 50 matches/file and 300 overall (`truncated` flags a capped result). Binaries and files over 1MB are skipped without a storage read. |
| GET | `/files/download-zip` | — | `application/zip` | Built in memory from every `ProjectFile` row; a storage object missing is skipped (logged), any other storage failure is a 503. |

There is no endpoint to write a file directly — `ProjectFileService.saveFile` is only ever called internally, from the AI generation pipeline.
