# Live Previews

## `PreviewController` (`/api/projects/{projectId}/preview`, `/api/previews`)

No controller-level authorization annotation — every method resolves project access and preview ownership inside the service.

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/preview` | — | `PreviewResponse` or 204 | The project's latest preview in any state. Polling it (which the client does while active) is what keeps a live preview out of the idle reaper. |
| POST | `/preview` (alias `/deploy`) | — | `PreviewResponse` (202) | Starts one, or returns the one already running/starting. 402 (`PREVIEW_LIMIT`) pre-flight; 503 if every runner pod is busy. |
| POST | `/preview/restart` | — | `PreviewResponse` (202) | Re-runs the bootstrap on the same pod and hostname. |
| DELETE | `/preview` | — | 204 | Ends the **caller's own session**, not necessarily the runner — see `docs/schema/`'s `PREVIEW_SESSION` entity. |
| GET | `/preview/logs` | — | `PreviewLogsResponse { log, live }` | Live from the pod while up, or the saved failure tail once it isn't. |
| GET | `/api/previews` | — | `List<PreviewResponse>` | The caller's own active previews across all their projects. |
