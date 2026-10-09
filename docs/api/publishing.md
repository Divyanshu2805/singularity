# Publishing

A production build of a project, served at a public link. **Service:** workspace-service · **Controllers:** `PublishController` (`/api/projects/{projectId}/publish`) and `PublicAppController` (`/api/public/apps/{slug}`)

Reading the state needs project `VIEW` (any member). Everything that changes it needs `PUBLISH`, which only the **owner** holds. The public page's three `GET`s need no session at all; the fork needs one.

## Publishing a project

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `GET` | `/publish` | - | `PublishResponse` | Where the publish stands. Polled by the panel: quickly while a build runs, slowly while the app is live. |
| `POST` | `/publish` | `{ slug? }` (body optional) | `PublishResponse` (`202`) | **Owner.** Starts a build that puts the project's current revision online, or replaces what is online. `slug` is the link name and is used only the first time; naming a different one later is a `400`. A build already running answers with itself. `402` (`PUBLISH_LIMIT`) when the plan's live apps are all in use; `409` when the link name is taken; `429` (with `Retry-After`) when a build started less than 30 seconds ago or the person has started ten in the last hour; `503` when storage or the cluster failed. |
| `DELETE` | `/publish` | - | `204` | **Owner.** Takes the app down at once; the link stays the project's. Idempotent. Switches sharing off. `503` if storage cannot be reached, with nothing changed, so it can be repeated. |
| `PUT` | `/publish/sharing` | `{ shared: boolean }` | `PublishResponse` | **Owner.** Switches whether the code of the live build is on the public page. `400` unless the app is live. |
| `GET` | `/publish/log` | - | `{ log }` | **Owner.** The saved output of the last failed build, or `null`. |

### `PublishResponse`

| Field | Meaning |
|---|---|
| `live` | Whether an app is being served. |
| `url` | The link, when live. |
| `slug` | The link's name; `null` only for a project never published (an unpublished one keeps its name). |
| `suggestedSlug` | The name the link would get, when there is no `slug` yet. |
| `publishedAt` | When the live build was made. |
| `hasChanges` | The project has moved since the live build was made - the panel offers **Update**. |
| `shared` | The code is on the public page. |
| `build` | `null`, or the build under way or the last one that failed: `status` (`BUILDING` or `FAILED`), `step` (`Collecting your files`, `Starting a build machine`, `Copying your files`, `Installing packages`, `Building your app`, `Checking the result`, `Collecting the build`, `Putting it online`), `startedAt`, and for a failure `failureKind` (`INSTALL`, `BUILD`, `NO_OUTPUT`, `TOO_LARGE`, `TIMEOUT`, `CAPACITY`, `PLATFORM`) and `failureMessage`. A failed update leaves `live` true. |

The project list (`GET /api/projects`) carries `publishedUrl` on each summary whose app is live, for every member alike.

## The public page of a shared app

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/public/apps/{slug}` | - | `PublicAppResponse { name, slug, url, publishedAt, fileCount }` | **No session.** `404` when the app is not published, not shared or its project is deleted - the same answer for each. |
| `GET` | `/api/public/apps/{slug}/files` | - | `[{ path, size }]` | **No session.** The files of the live build's sources. |
| `GET` | `/api/public/apps/{slug}/files/content?path=` | - | `{ path, content, binary }` | **No session.** Text up to 512 KB; a binary file comes back with `binary: true` and no content. `400` for a bad path or a file too large to show. |
| `POST` | `/api/public/apps/{slug}/fork` | `{ name? }` (optional) | `ProjectResponse` (`201`) | **Signed in** and `X-XSRF-TOKEN` like any write. A new project the caller owns, made from the same snapshot. `402` (`PROJECT_LIMIT`) at the plan's project limit. |

Only a `GET` on `/api/public/**` is anonymous (`app.security.public-get-paths`); the Gateway routes the prefix to workspace-service.

## Serving a published app

Not an API: the preview proxy answers `GET` and `HEAD` at `<name>.<public domain>` for anyone. See [the flow](../architecture/flows/publishing.md#serving).

## Related

- [The publishing flow](../architecture/flows/publishing.md) and [ADR 0008](../architecture/decisions/0008-published-apps.md).
- [`PUBLISHED_APP`](../schema/workspace-service.md#published_app).
