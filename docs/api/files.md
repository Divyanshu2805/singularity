# Files

Reading a project's files, and saving one by hand. **Service:** workspace-service · **Controller:** `FileController` (`/api/projects/{projectId}/files`)

Every read requires project `VIEW` (any member) and answers `403` to anyone else. The one write requires `EDIT`.

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `GET` | `/files` | — | `FileTreeResponse` | Every file in the project. |
| `GET` | `/files/content?path=` | — | `FileContentResponse { path, content, hash }` | The path is normalized first, so a leading `/` doesn't turn an existing file into a `404`. `404` if the file genuinely doesn't exist. `hash` is the SHA-256 of the stored bytes - what a save sends back. |
| `PUT` | `/files/content` | `SaveFileRequest { path, content, baseHash }` (`content` at most 200,000 characters) | `SaveFileResponse { path, hash, revisionId }` | Saves a file changed by hand as one `MANUAL_EDIT` revision. Project `EDIT`. `404` if the project has no such file - a save never creates one. `409` if `baseHash` is not the hash of what the file holds now (a build, a collaborator or a restore changed it), or if the publish lost a race. `revisionId` is `null` when the content was already what the file held and nothing was written. |
| `POST` | `/files` | `CreateFileRequest { path }` | `SaveFileResponse { path, hash, revisionId }` | Adds a new, empty file by hand as one `MANUAL_EDIT` revision; it is filled by a save. Project `EDIT`. `400` for a path `ProjectFilePath` refuses; `409` if a file is already there, if the path is a folder's or runs through a file, or if the publish lost a race. The project's file-count and size limits apply as to every write. |
| `DELETE` | `/files?path=` | — | `204` | Removes a file by hand as one `MANUAL_EDIT` revision. Project `EDIT`. `404` if the project has no such file; `409` if the publish lost a race. |
| `GET` | `/files/search?q=` | — | `CodeSearchResponse` | **Literal, case-insensitive substring match — not a regex**, so searches like `useState(` work as typed. At most 50 matches per file and 300 overall; `truncated` is set on a capped result. Binary files and files over 1 MB are skipped. |
| `GET` | `/files/download-zip` | — | `application/zip` | The whole project, built in memory, with a `README.md` that says how to run it and put it online and a `.gitignore` added when the project has none of its own (`ProjectHandout`; they are written for the download and not stored in the project). A missing storage object is skipped (and logged); any other storage failure is a `503`. |

## Writing files

Files change only by publishing a revision - nothing writes to storage any other way:

- an AI turn publishes one through the [internal API](internal.md) when its stream completes;
- a user saves one file by hand with `PUT /files/content` - from the Code tab's editor, or by changing the app's words with **Edit text** in the preview ([how](../architecture/flows/live-preview.md#editing-the-apps-words-by-hand)) - adds an empty one with `POST /files` or removes one with `DELETE /files`, above;
- a user can restore an earlier revision, or undo one, through the [Revisions](revisions.md) endpoints.

A save by hand is checked per file, by hash, and not against the project's revision: a build that changed other files while this one was open does not refuse it. A file is added empty and then saved; renaming by hand is not built - it is a new file and a removal.

See [File revisions](../architecture/file-revisions.md).
