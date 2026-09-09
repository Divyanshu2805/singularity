# Files

Reading a project's files. **Service:** workspace-service · **Controller:** `FileController` (`/api/projects/{projectId}/files`)

Every endpoint requires project `VIEW` (any member) and answers `403` to anyone else.

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `GET` | `/files` | — | `FileTreeResponse` | Every file in the project. |
| `GET` | `/files/content?path=` | — | `FileContentResponse` | The path is normalized first, so a leading `/` doesn't turn an existing file into a `404`. `404` if the file genuinely doesn't exist. |
| `GET` | `/files/search?q=` | — | `CodeSearchResponse` | **Literal, case-insensitive substring match — not a regex**, so searches like `useState(` work as typed. At most 50 matches per file and 300 overall; `truncated` is set on a capped result. Binary files and files over 1 MB are skipped. |
| `GET` | `/files/download-zip` | — | `application/zip` | The whole project, built in memory. A missing storage object is skipped (and logged); any other storage failure is a `503`. |

## Writing files

There is no endpoint to write a file directly. Files change only by publishing a revision:

- an AI turn publishes one through the [internal API](internal.md) when its stream completes;
- a user can restore an earlier revision through the [Revisions](revisions.md) endpoints.

See [File revisions](../architecture/file-revisions.md).
