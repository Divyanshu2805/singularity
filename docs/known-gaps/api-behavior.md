# Known Behavior Worth Knowing About

A few response-shape quirks that are easy to mistake for bugs when integrating against this API (design gaps and open questions live in `TODO.md`, not here — these are just documented current behavior):

- **A nonexistent project id returns 403, not 404.** `@PreAuthorize`'s role check runs before any controller method's own 404 logic, and a missing project and a real project you're not a member of look identical to that check — both deny with 403.
- **`GET /api/projects/{id}` on a soft-deleted project is a 404** via the same accessible-project lookup every other project endpoint uses — deleted projects are excluded at the query level, not by a separate check.
- **A quota response (402) is not the same thing as a failed request** — treat it as "the request would have worked, but this plan can't." All three reasons (`DAILY_TOKENS`, `PROJECT_LIMIT`, `PREVIEW_LIMIT`) are pre-flight-checked before any expensive work starts, so a caller who's out of budget never pays for a partial generation attempt.
