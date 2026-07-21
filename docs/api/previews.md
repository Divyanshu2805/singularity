# Live Previews

## `PreviewController` (`/api/projects/{projectId}/preview`, `/api/previews`)

No controller-level authorization annotation — every method resolves project access and preview ownership inside the service.

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/preview` | — | `PreviewResponse` or 204 | The project's latest preview in any state. Polling it (which the client does while active) is what keeps a live preview out of the idle reaper. |
| POST | `/preview` (alias `/deploy`) | — | `PreviewResponse` (202) | Starts one, or returns the one already running/starting. 402 (`PREVIEW_LIMIT`) pre-flight. Two different **503**s, told apart by `code`: `CAPACITY_UNAVAILABLE` when every runner pod is busy (the message says so), `UPSTREAM_UNAVAILABLE` when the cluster, Redis or storage failed (generic message; the cause is in the server log). |
| POST | `/preview/restart` | — | `PreviewResponse` (202) | Re-runs the bootstrap on the same pod and hostname. |
| DELETE | `/preview` | — | 204 | Ends the **caller's own session**, not necessarily the runner — see `docs/schema/`'s `PREVIEW_SESSION` entity. |
| GET | `/preview/logs` | — | `PreviewLogsResponse { log, live }` | Live from the pod while up, or the saved failure tail once it isn't. |
| GET | `/api/previews` | — | `List<PreviewResponse>` | The caller's own active previews across all their projects. |
