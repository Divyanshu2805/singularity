# 3. How the Services Talk

**The Gateway** matches each request path against an ordered route table (`gateway-service/src/main/resources/application.yaml`) and forwards it, unmodified, to the service that owns it. The order is load-bearing: `/api/projects/*/code/**` (intelligence) sits under `/api/projects/**` (workspace), and only wins because its `order` is lower. `RoutingTableTest` evaluates the real table against every endpoint. `/internal/**` matches no route: it is never reachable through the Gateway. A path no route owns is a 404 from the Gateway itself.

**The internal API.** Each service exposes `/internal/v1/**` for the others, never for the browser. It is guarded by `InternalServiceAuthFilter`: the caller must send the shared secret (`INTERNAL_SERVICE_SHARED_SECRET`) in `X-Internal-Service-Token`, and a user's session cookie is not accepted there. `FeignClientInterceptor` adds that header, and only for paths starting `/internal/` — which is why a Feign client must not carry a `@FeignClient(path = ...)` prefix (the interceptor would no longer see `/internal/` and every call would be a 401). Callers resolve targets by service name through Eureka.

| Endpoint (`/internal/v1/…`) | Owner | Called by | For |
|---|---|---|---|
| `GET users/{id}`, `users/by-username`, `users/by-firebase-uid` | account | workspace, intelligence | Resolving a session's Firebase uid to a user; invite-by-email |
| `GET sessions/revoked?cookieHash=` | account | workspace, intelligence | The revocation check when a session isn't in the local cache |
| `GET users/{id}/plan-limits` | account | workspace, intelligence | The effective plan's limits (free-tier fallback included) for quota checks |
| `POST sessions/evict` | workspace, intelligence | account | Push-evicting a signed-out session from their local caches |
| `GET projects/{id}/members/{userId}` | workspace | intelligence | The caller's `ProjectRole` on a project (`role: null` = not a member) |
| `GET projects/{id}`, `projects?ids=`, `projects/owned-count?userId=` | workspace | intelligence | Project summaries (deleted ones included, for usage insights); a user's owned-project count |
| `GET`/`POST`/`DELETE projects/{id}/files`, `GET projects/{id}/files/content` | workspace | intelligence | Reading the tree and content for prompts and code insight; writing and deleting files when a generated turn lands |
| `POST project-names` | intelligence | *(nothing yet)* | An AI-quality project name; `from-prompt` still uses `ProjectNameHeuristic` in workspace |

Two rules follow from services owning their data. A cross-service reference is a **plain id column, never a foreign key** — `project_members.user_id` points at a user in another database, and a dangling id is possible (`docs/schema/`). And an internal endpoint enforces no user permission of its own: the caller has already authorized the request it is acting on.
