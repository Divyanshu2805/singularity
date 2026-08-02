# Known Behavior Worth Knowing About

A few response-shape quirks that are easy to mistake for bugs when integrating against this API (design gaps and open questions live in `TODO.md`, not here — these are just documented current behavior):

- **A nonexistent project id returns 403, not 404.** `@PreAuthorize`'s role check runs before any controller method's own 404 logic, and a missing project and a real project you're not a member of look identical to that check — both deny with 403. (Through the *internal* API it is different: `GET /internal/v1/projects/{id}/members/{userId}` answers 404 for a missing project and 200 with `role: null` for a non-member, and the calling service turns both into a denial.)
- **`GET /api/projects/{id}` on a soft-deleted project is a 404** for a caller who was a member — deleted projects are excluded at the query level, not by a separate check.
- **A quota response (402) is not the same thing as a failed request** — treat it as "the request would have worked, but this plan can't." All three reasons (`DAILY_TOKENS`, `PROJECT_LIMIT`, `PREVIEW_LIMIT`) are pre-flight-checked before any expensive work starts, so a caller who's out of budget never pays for a partial generation attempt.
- **Only `account-service` enforces a CORS origin allowlist** (`http://localhost:5173` and `http://localhost:5174`). A request carrying any other `Origin` header gets `403 "Invalid CORS request"` from account-service alone; workspace and intelligence accept any origin. It is invisible through the Vite dev proxy, which strips `Origin`.
