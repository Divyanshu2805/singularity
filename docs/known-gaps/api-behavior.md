# API Behavior Worth Knowing

Response behaviour that is easy to mistake for a bug when integrating with the API. All of it is current, intended behaviour.

## A nonexistent project is a `403`, not a `404`

`@PreAuthorize` role checks run before a controller's own not-found handling, and a missing project looks the same as a project you aren't a member of — both are denied with `403`. This also avoids confirming which project ids exist.

The internal API differs: `GET /internal/v1/projects/{id}/members/{userId}` answers `404` for a missing project and `200` with `role: null` for a non-member, and the calling service turns both into a denial.

## A deleted project is a `404` for its former members

`GET /api/projects/{id}` on a soft-deleted project returns `404` to someone who was a member. Deleted projects are excluded at the query level.

## A `402` means "your plan can't", not "the request failed"

A quota response means the request was valid and would have worked on a bigger plan. All three reasons (`DAILY_TOKENS`, `PROJECT_LIMIT`, `PREVIEW_LIMIT`) are checked before any expensive work starts, so a caller who is out of budget never pays for a partial attempt. The `quota` object says which limit was hit and when it resets.

## Another member's note is a `404`

Deleting a code note that belongs to someone else returns `404`, not `403`. Notes are looked up scoped to the caller, so another member's note simply isn't found — which also avoids confirming that it exists.

## Removed auth endpoints return `401`

The old `/api/auth/signup`, `/login`, `/forgot-password` and `/reset-password` endpoints return `401`, not `404`, because the security chain rejects the unauthenticated request before routing finds there is no handler.

## Preview URLs change on every poll

Every preview response carries a freshly signed access token in `previewUrl`, so the URL string changes each time. Compare `id` and `status` to detect a real change.

## Usage days follow the server's time zone

The daily AI budget resets at midnight in the **server's** time zone, and `resetsAt` reports that instant. Usage insights are bucketed in the same zone.
