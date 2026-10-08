# Previews

Live previews of a project, running in a Kubernetes pod. **Service:** workspace-service · **Controller:** `PreviewController` (`/api/projects/{projectId}/preview`, `/api/previews`)

Project-scoped endpoints require project `VIEW` (any member), except restart, which requires `EDIT`. `GET /api/previews` lists only the caller's own previews.

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `GET` | `/preview` | — | `PreviewResponse`, or `204` | The project's latest preview, in any state. Polling it (the client does while a preview is open) keeps a live preview from being reclaimed as idle, and ends one whose pod has gone. |
| `POST` | `/preview` | — | `PreviewResponse` (`202`) | Starts a preview, or returns the one already running or starting. When every runner is busy it still answers `202`: the preview is `CREATING` with a `queuePosition`, and starts by itself when a runner comes free. `402` (`PREVIEW_LIMIT`) if the caller's plan allows no more. `503` (`UPSTREAM_UNAVAILABLE`) when the cluster, Redis or storage failed. |
| `POST` | `/preview/restart` | — | `PreviewResponse` (`202`) | **Requires `EDIT`.** Re-runs the start-up on the same pod and hostname — for everyone who has it open, since the runner is shared, which is why a viewer may not. |
| `DELETE` | `/preview` | — | `204` | Ends the **caller's own session**, not necessarily the runner. The runner stops when its last session ends. Idempotent. |
| `GET` | `/preview/logs` | — | `PreviewLogsResponse { log, live }` | Live output from the pod while it runs, or the saved failure output once it doesn't. |
| `GET` | `/api/previews` | — | `List<PreviewResponse>` | The caller's own active previews across all their projects. |

## `PreviewResponse`

| Field | Meaning |
|---|---|
| `id`, `projectId`, `projectName` | The caller's session id, the project, and its name (set only on `GET /api/previews`). |
| `status` | `CREATING`, `RUNNING`, `FAILED` or `TERMINATED`. |
| `previewUrl` | See [preview URLs](#preview-urls). |
| `detail` | While `CREATING`: the step in progress (`Waiting for a free runner`, `Starting a runner`, `Copying project files`, `Installing dependencies`, `Starting the dev server`, or `Restarting the dev server` / `Installing new packages` for a restart). Once ended: why, in one sentence. |
| `startedAt`, `readyAt`, `terminatedAt`, `stopsAt` | Lifecycle timestamps; `stopsAt` is when inactivity will stop a running preview. |
| `canStop` | Whether the caller has a session open on it. |
| `failureKind` | On a `FAILED` preview: `INSTALL`, `DEV_SERVER`, `TIMEOUT`, `CAPACITY` or `PLATFORM`. Only `PLATFORM` is worth retrying without a change to the project. See [when a start fails](../architecture/flows/live-preview.md#when-a-start-fails). |
| `queuePosition` | While waiting for a runner: the caller's place in the line, `1` being next. `null` otherwise. |
| `syncState`, `syncDetail` | On a `RUNNING` preview: `UP_TO_DATE` when the runner has the project's current revision, `UPDATING` (with the step under way) while a newer one is being applied. `null` otherwise. |

## Preview URLs

Every `PreviewResponse.previewUrl` carries a `?pvt=` access token, freshly signed on every response. The preview proxy accepts either the token or the cookie a valid token was exchanged for on first load, and answers `401` to a request with neither.

Because the token changes on every response, don't use `previewUrl` to detect whether a preview changed; compare `id` and `status` instead. See [access boundary](../architecture/flows/live-preview.md#access-boundary).

## Related

- [Live preview flow](../architecture/flows/live-preview.md).
- [`PREVIEW` and `PREVIEW_SESSION`](../schema/workspace-service.md#preview) — the shared-runner and per-collaborator session model.
