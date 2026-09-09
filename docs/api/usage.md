# Usage

The usage meter, insights and export. **Service:** intelligence-service · **Controller:** `UsageController` (`/api/usage`)

Plan allowances come from account-service; project and preview counts from workspace-service.

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/usage/today?projectId=` | — | `UsageTodayResponse` | The single answer to "how much is left": tokens, previews and projects, plus `resetsAt` (the next midnight in the **server's** time zone). With `projectId`, also that project's tokens today and the caller's most recent AI call. `previewsRunning` is the same count the preview quota is checked against, so the meter and a `402` can't disagree. |
| `GET` | `/api/usage/insights?range=` | — | `UsageInsightsResponse` | `range` is `today`, `7d`, `30d` or `90d`. Daily or hourly totals stacked by feature, breakdowns by feature and by project, and days spent at the limit. Bucketed in the server's time zone. `400` for any other range. |
| `GET` | `/api/usage/events?page=&size=` | — | `UsageEventPage` | Recent AI requests, newest first. `size` is capped at 100. |
| `GET` | `/api/usage/events/export?range=` | — | `text/csv` | RFC 4180 quoting. A project name starting with `=`, `+`, `-` or `@` is prefixed with `'` so a spreadsheet can't evaluate it as a formula. |
| `GET` | `/api/usage/limits` | — | `PlanLimitsResponse { planName, maxTokensPerDay, maxProjects, unlimitedAi }` | The caller's effective plan limits. |

## Related

- [`USAGE_LOG` and `USAGE_EVENT`](../schema/intelligence-service.md#usage_log--usage_event) — why usage is recorded twice.
- [Billing](billing.md) — plans and subscriptions.
