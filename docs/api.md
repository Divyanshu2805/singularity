# API

Every request goes to the Gateway (`:8000` locally, the app's own origin in production).

| | |
|---|---|
| Auth | `__Host-vc_session` httpOnly cookie, from `POST /api/auth/session` |
| CSRF | Every `POST`/`PUT`/`PATCH`/`DELETE` sends `X-XSRF-TOKEN` (call `GET /api/auth/csrf` once) |
| Body limit | 1 MB at the Gateway |
| Roles | `VIEWER` < `EDITOR` < `OWNER` per project. A non-member gets `403`, even for an id that doesn't exist |
| Quota | `402` with a `quota` object before any work starts |
| Streams | Server-sent events, with a keep-alive every ~20 s |

Errors share one shape from every service:

```json
{ "status": 402, "message": "...", "requestId": "...", "errors": null,
  "quota": { "reason": "DAILY_TOKENS", "limit": 100000, "used": 100000, "resetsAt": "...", "planName": "Free" },
  "code": null }
```

`errors` lists invalid fields on a `400`. `code` tells the two kinds of `503` apart (`CAPACITY_UNAVAILABLE` vs `UPSTREAM_UNAVAILABLE`).

## account-service

| Method | Path | |
|---|---|---|
| GET | `/api/auth/csrf` | CSRF cookie |
| POST | `/api/auth/session` | Firebase ID token → session cookie |
| POST | `/api/auth/logout`, `/logout-all` | This session / every session |
| GET | `/api/auth/me` | Current user |
| POST | `/api/auth/account/delete` | Delete the account and everything it owns |
| GET, POST | `/api/auth/security-events` | Sign-in history |
| GET | `/api/plans` | Plan catalogue (public) |
| GET | `/api/me/subscription` | Current plan and limits |
| POST | `/api/payments/checkout`, `/portal`, `/confirm`, `/change-plan` | Stripe checkout and portal |
| POST | `/webhooks/payment` | Stripe webhook (signed, idempotent) |

## workspace-service

Paths below `/api/projects/{id}`.

| Method | Path | |
|---|---|---|
| GET, POST | `/api/projects` | List / create |
| POST | `/api/projects/from-prompt` | Create from an idea |
| GET, PATCH, DELETE | `/api/projects/{id}` | Read / rename / soft delete |
| POST | `/fork` | Fork |
| PUT, DELETE | `/pin`, `/star` | Pin / star |
| GET, PUT | `/thumbnail` | Card picture |
| GET | `/api/projects/invitations` | My pending invites |
| GET, POST | `/members` | List / invite |
| POST | `/members/accept`, `/members/decline` | Answer an invite |
| PATCH, DELETE | `/members/{memberId}` | Change role / remove |
| DELETE | `/members/invites/{inviteId}` | Withdraw an invite |
| GET, POST, DELETE | `/files` | Tree / add / delete |
| GET, PUT | `/files/content` | Read / save (with base hash) |
| GET | `/files/search?q=`, `/files/download-zip` | Search / ZIP |
| GET | `/revisions` | History |
| GET, POST | `/revisions/{rid}/preview`, `/restore` | Diff / restore |
| GET, POST, DELETE | `/preview` | Status / start / stop |
| POST | `/preview/restart` | Restart |
| GET | `/preview/logs` | Dev server output |
| GET | `/api/previews` | My running previews |
| GET, POST, DELETE | `/publish` | Status / publish / unpublish |
| DELETE | `/publish/build` | Cancel a build |
| PUT | `/publish/sharing` | Show code on the share page |
| GET | `/publish/log` | Build log |
| GET, DELETE | `/github`, POST `/github/push` | Linked repo / push |
| GET, DELETE | `/api/github`, POST `/connect`, `/callback` | GitHub OAuth connection |
| GET | `/api/public/apps/{slug}`, `/files`, `/files/content` | Share page (anonymous) |
| POST | `/api/public/apps/{slug}/fork` | Fork a shared app |

## intelligence-service

| Method | Path | |
|---|---|---|
| POST | `/api/chat/stream` | Run a build turn (SSE) |
| GET, DELETE | `/api/chat/projects/{id}` | History / clear |
| GET | `/api/chat/projects/{id}/active`, `/active/stream` | Is a turn running / rejoin it |
| POST | `/api/chat/projects/{id}/active/stop` | Stop it |
| GET | `/api/chat/projects/{id}/last-turn-changes` | Files the last turn touched |
| POST | `/api/chat/projects/{id}/title`, `/message-titles`, `/suggestions` | Short model calls |
| POST | `/api/ideas/clarify`, `/compile` | Interview questions / brief |
| POST | `/code/explain`, `/ask` (+ `/stream`) | Explain a selection / answer a question |
| POST | `/code/lesson/stream`, `/overview/stream` | Step lesson / big picture |
| GET, POST | `/code/tour` (+ `/stream`) | Project tour |
| GET, POST, DELETE | `/code/glossary` (+ `/stream`, `/{entryId}`) | Glossary |
| POST | `/code/task/stream`, `/task-check/stream` | Exercise / check it |
| GET, POST, DELETE | `/code/notes` (+ `/{noteId}`) | Private notes |
| GET | `/api/usage/today`, `/insights`, `/events`, `/events/export`, `/limits` | Usage meter and history |

`/code/*` paths are under `/api/projects/{id}`.

## Chat stream events

| Event | Data |
|---|---|
| *(none)* | Next piece of text |
| `status` | What the server is doing (`Reading 4 files`, `Saving your changes`) |
| `replace` | Whole text so far, after the server trimmed something |
| `done` | Outcome, sent only after the turn is saved |
| `error` | Saving failed, nothing changed |

`done` outcomes: `SAVED`, `ANSWERED`, `INCOMPLETE`, `NOT_SAVED`, `EMPTY`, `FAILED`, `STOPPED`, `OUT_OF_BUDGET`. If the stream closes without `done`, check `/active` and rejoin, or reload history.

## Internal API

`/internal/v1/**`, service to service only, with the `X-Internal-Service-Token` header.

| Owner | Endpoints | Used for |
|---|---|---|
| account | `users/{id}`, `users/by-firebase-uid`, `sessions/revoked`, `users/{id}/plan-limits` | Session lookup, revocation, quotas |
| workspace, intelligence | `sessions/evict` | Sign-out cache eviction |
| workspace | `projects/{id}/members/{userId}`, `projects/{id}`, `projects/{id}/files`, `files/content`, `projects/{id}/revisions`, `previews/running-count` | Role checks, files for prompts, saving a turn |
| intelligence | `projects/{id}/generation/stop` | Stop a turn when access is revoked |
