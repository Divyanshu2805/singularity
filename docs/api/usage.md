# Usage

## `UsageController` (`/api/usage`)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/today?projectId=` | — | `UsageTodayResponse` | The one answer to "how much is left" — tokens, previews, projects, `resetsAt` (next midnight in the **server's** zone). With `projectId`, also this project's tokens today and the caller's most recent AI call. `previewsRunning` is currently always `0` — a real, live bug (see `TODO.md`). |
| GET | `/insights?range=today\|7d\|30d\|90d` | — | `UsageInsightsResponse` | Daily/hourly bars stacked by feature, by-feature/by-project breakdowns, days-at-limit. Bucketed in the server's timezone. 400 on an unrecognized range. |
| GET | `/events?page&size` | — | `UsageEventPage` | Recent AI requests, newest first. `size` capped at 100. |
| GET | `/events/export?range=` | — | `text/csv` | RFC 4180 quoting; a project name starting with `=+-@` is prefixed with `'` so a spreadsheet can't execute it as a formula. |
| GET | `/limits` | — | `PlanLimitsResponse` | Same active-plan lookup as the others. |
