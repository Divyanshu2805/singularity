# Previews

Live previews of a project, running in a Kubernetes pod. **Service:** workspace-service · **Controller:** `PreviewController` (`/api/projects/{projectId}/preview`, `/api/previews`)

Project-scoped endpoints require project `VIEW` (any member). `GET /api/previews` lists only the caller's own previews.

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `GET` | `/preview` | — | `PreviewResponse`, or `204` | The project's latest preview, in any state. Polling it (the client does while a preview is open) keeps a live preview from being reclaimed as idle. |
| `POST` | `/preview` (alias `/deploy`) | — | `PreviewResponse` (`202`) | Starts a preview, or returns the one already running or starting. `402` (`PREVIEW_LIMIT`) if the caller's plan allows no more. Two distinct `503`s, told apart by `code`: `CAPACITY_UNAVAILABLE` when every runner pod is busy, `UPSTREAM_UNAVAILABLE` when the cluster, Redis or storage failed. |
| `POST` | `/preview/restart` | — | `PreviewResponse` (`202`) | Re-runs the start-up on the same pod and hostname — for everyone who has it open, since the runner is shared. |
| `DELETE` | `/preview` | — | `204` | Ends the **caller's own session**, not necessarily the runner. The runner stops when its last session ends. Idempotent. |
| `GET` | `/preview/logs` | — | `PreviewLogsResponse { log, live }` | Live output from the pod while it runs, or the saved failure output once it doesn't. |
| `GET` | `/api/previews` | — | `List<PreviewResponse>` | The caller's own active previews across all their projects. |

## Preview URLs

Every `PreviewResponse.previewUrl` carries a `?pvt=` access token, freshly signed on every response. The preview proxy accepts either the token or the cookie a valid token was exchanged for on first load, and answers `401` to a request with neither.

Because the token changes on every response, don't use `previewUrl` to detect whether a preview changed; compare `id` and `status` instead. See [access boundary](../architecture/flows/live-preview.md#access-boundary).

## Related

- [Live preview flow](../architecture/flows/live-preview.md).
- [`PREVIEW` and `PREVIEW_SESSION`](../schema/workspace-service.md#preview) — the shared-runner and per-collaborator session model.
