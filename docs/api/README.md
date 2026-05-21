# APIs

7 REST controllers exist (`ChatController` new 2026-05-16). `AuthController`'s `signup`/`login`, all 6 `ProjectController` endpoints, all 5 `ProjectMemberController` endpoints, both `FileController` endpoints, `BillingController`'s `GET /api/me/subscription`/`POST /api/payments/checkout`/`POST /api/payments/portal`/`POST /webhooks/payment`, and both `ChatController` endpoints now have real logic behind them (see [Project Status](../project-status.md#project-status)); only `BillingController`'s `GET /api/plans` and every `UsageController` endpoint still resolve to a stub service method (returns `null`, an empty list, or does nothing). Every endpoint except `/api/auth/**` (and `/webhooks/**`, for Stripe's own calls) requires a `Bearer` JWT (`WebSecurityConfig` — see [Practices / Conventions](../practices/conventions.md#practices--conventions)); no controller hardcodes `userId` any more. 8 of the 11 real `Project`/`ProjectMember` methods are additionally `@PreAuthorize`-gated by role (see the Project Status "Authorization" row) — the three that aren't (`GET /api/projects`, `POST /api/projects`, `POST /members/accept`) don't need to be, since they're inherently self-scoped (accepting an invite only ever acts on the caller's own `ProjectMember` row). Every request body below is validated (`@Valid` + Bean Validation constraints on the DTO) — see [Request Validation](#request-validation) below the tables for the full constraint list per field.

## AuthController (`/api/auth`)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/api/auth/signup` | `SignupRequest` (`username` *(@Email)*, `name`, `password`, `@Valid`) | `AuthResponse` (`token`, `user`) | **Real** — 400 `BadRequestException` if `username` is already taken; hashes `password` via `PasswordEncoder` (BCrypt), saves the `User`, maps via `UserMapper`, returns a real JWT (`AuthUtil.generateAccessToken`) usable immediately, no separate login required |
| POST | `/api/auth/login` | `LoginRequest` (`username` *(@Email)*, `password`, `@Valid`) | `AuthResponse` | **Real** — delegates to Spring Security's `AuthenticationManager` (which calls `UserServiceImpl.loadUserByUsername` + the same `PasswordEncoder` to verify the password); returns a real JWT (`AuthUtil.generateAccessToken`) |
| GET | `/api/auth/me` | — | `UserProfileResponse` (`id`, `username`, `name`) | Stub — `UserServiceImpl.getProfile()` still returns `null`, even though the caller's identity is now available via `AuthUtil.getCurrentUserId()` |

## ProjectController (`/api/projects`)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/api/projects` | — | `List<ProjectSummaryResponse>` (`id`, `projectName`, `createdAt`, `updatedAt`) | **Real** — `ProjectRepository.findAllAccessibleByUser` (any project the caller is a member of, any role) + `ProjectMapper`. Not `@PreAuthorize`-gated (it's inherently self-scoped — always the caller's own list) |
| GET | `/api/projects/{id}` | — | `ProjectResponse` | **Real** — `@PreAuthorize("@security.canViewProject(#id)")` (any role), then member-scoped lookup (404 `ResourceNotFoundException` if missing/not a member — reachable only for a soft-deleted project, see Project Status "Known gaps") via `ProjectServiceImpl.getAccessibleProjectById`, maps via `ProjectMapper` |
| POST | `/api/projects` | `ProjectRequest` (`name`, `@Valid`) | `ProjectResponse` (201) | **Real** — 2026-05-04: first calls `SubscriptionService.canCreateNewProject()`, 400 `BadRequestException` if the caller is already at their plan's project limit; otherwise looks up the caller via `UserRepository` (404 `ResourceNotFoundException` if missing), saves the `Project`, then creates a `ProjectMember` row for the caller with `projectRole = OWNER`, maps via `ProjectMapper`. Not `@PreAuthorize`-gated — creating a project doesn't need a pre-existing permission |
| PATCH | `/api/projects/{id}` | `ProjectRequest` (`@Valid`) | `ProjectResponse` | **Real** — `@PreAuthorize("@security.canEditProject(#id)")` (`EDITOR`/`OWNER` only, not `VIEWER`), then member-scoped lookup via `getAccessibleProjectById`, updates `name`, saves, maps via `ProjectMapper` |
| DELETE | `/api/projects/{id}` | — | 204 No Content | **Real** — `@PreAuthorize("@security.canDeleteProject(#id)")` (`OWNER` only), then member-scoped lookup via `getAccessibleProjectById`, sets `deletedAt` |
| POST | `/api/projects/{id}/retry-template-init` | — | `ProjectResponse` | **Real**, added 2026-05-16 (later pass) — `@PreAuthorize("@security.canEditProject(#id)")`; re-runs `ProjectTemplateService.initializeProjectFromTemplate` (idempotent — only copies files still missing) and updates/clears `templateInitIssue` based on the result, returning the up-to-date project. A `FileStorageException` from a still-incomplete attempt propagates as a 503, unlike `createProject` where the same failure is deliberately non-fatal — this endpoint's whole purpose is attempting (and honestly reporting on) a fix, not silently succeeding |

`ProjectResponse` gained a `templateInitIssue` field (2026-05-16, later pass) — `null` when a project's starter template is fully initialized (or template init wasn't attempted), otherwise a description of what's still missing. Returned by both `POST /api/projects` and the retry endpoint above.

## ProjectMemberController (`/api/projects/{projectId}/members`)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/api/projects/{projectId}/members` | — | `List<MemberResponse>` | **Real** — `@PreAuthorize("@security.canViewMembers(#projectId)")` (any role), then all `ProjectMember` rows for the project (`ProjectMemberRepository.findByIdProjectId`), including the owner's own row (`projectRole = OWNER`) — there's no separate synthetic owner entry any more, the owner is just a regular row |
| POST | `/api/projects/{projectId}/members` | `InviteMemberRequest` (`username` *(@Email)*, `role`, `@Valid`) | `MemberResponse` (201) | **Real** — `@PreAuthorize("@security.canManageMembers(#projectId)")` (`OWNER` only); 403 `ForbiddenException` for inviting yourself or an already-existing member; 404 `ResourceNotFoundException` if no user has that `username`; saves a new `ProjectMember` with `acceptedAt = null` (pending). Not restricted: an `OWNER` can invite someone in *as* `OWNER` too (see Project Status "Known gaps") |
| POST | `/api/projects/{projectId}/members/accept` | — | `MemberResponse` | **Real**, added 2026-04-26 — not `@PreAuthorize`-gated (self-scoped: looks up `(projectId, callerId)` directly, so it can only ever act on the caller's own row); 404 `ResourceNotFoundException` if the caller has no `ProjectMember` row for this project (i.e. was never invited); otherwise sets `acceptedAt` to now **only if it's still `null`** (idempotent — accepting twice doesn't overwrite the original timestamp) and returns the row. Previously missing entirely despite `ProjectMember.acceptedAt` existing on the entity since v1 |
| PATCH | `/api/projects/{projectId}/members/{memberId}` | `UpdateMemberRoleRequest` (`role`, `@Valid`) | `MemberResponse` | **Real** — `@PreAuthorize("@security.canManageMembers(#projectId)")` (`OWNER` only); 404 `ResourceNotFoundException` if no `ProjectMember` matches `(projectId, memberId)`, otherwise updates `projectRole`, saves |
| DELETE | `/api/projects/{projectId}/members/{memberId}` | — | 204 No Content | **Real** — `@PreAuthorize("@security.canManageMembers(#projectId)")` (`OWNER` only); 404 `ResourceNotFoundException` if the member doesn't exist, otherwise deletes |

## FileController (`/api/projects/{projectId}/files`)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/api/projects/{projectId}/files` | — | `FileTreeResponse` (`files: List<FileNode>`) | **Real**, repointed 2026-05-16 (later pass) — delegates to `ProjectFileService.getFileTree`, all `ProjectFile` rows for the project as a real list, not the single-`FileNode` stub this used to return |
| GET | `/api/projects/{projectId}/files/content?path=` | — | `FileContentResponse` (`path`, `content`) | **Real** — was already delegating to `ProjectFileService.getFileContent` (MinIO-backed) before this pass |

`ProjectFileService`/`ProjectFileServiceImpl` (MinIO-backed `getFileTree`/`getFileContent`/`saveFile`) is now the **only** file-storage abstraction in the codebase — the pre-existing `FileService`/`FileServiceImpl` stub was deleted 2026-05-16 once `FileController` was repointed at it, closing the duplication flagged since MinIO storage first landed. It's used both by this controller's public endpoints and internally by `ChatController`'s AI chat flow (see below). `saveFile(projectId, filePath, fileContent)` still has no dedicated controller endpoint — it's currently only ever called from `AiGenerationServiceImpl`'s generation pipeline, not exposed for a client to write a file directly.

## BillingController (no `@RequestMapping` prefix — full paths on each method)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/api/plans` | — | `List<PlanResponse>` | Stub — active plans |
| GET | `/api/me/subscription` | — | `SubscriptionResponse` | **Real** (has been since 2026-05-02, `3522cfa` — mislabeled as a stub in this doc for two passes, corrected 2026-05-04) — `SubscriptionServiceImpl.getCurrentSubscription()` looks up the caller's `ACTIVE`/`PAST_DUE`/`TRIALING` subscription, falling back to a blank `Subscription` (so the response always has a body, with `plan: null`, if the caller has never subscribed) via `SubscriptionMapper` |
| POST | `/api/payments/checkout` | `CheckoutRequest` (`planId`, `@Valid`) | `CheckoutResponse` (`checkoutUrl`) | **Real**, 2026-05-02 — delegates to `StripePaymentProcessor.createCheckoutSessionUrl`: builds a subscription-mode Stripe Checkout Session for the requested `Plan`, reusing `User.stripeCustomerId` via `setCustomer(...)` when already set, otherwise `setCustomerEmail(...)` (Stripe mints a new customer on that first checkout); stashes `user_id`/`plan_id` as session metadata for the webhook side to read back |
| POST | `/api/payments/portal` | — | `PortalResponse` (`portalUrl`) | **Real**, 2026-05-04 — delegates to `StripePaymentProcessor.openCustomerPortal()`: 400 `BadRequestException` if the caller has no `stripeCustomerId` yet (never checked out), otherwise creates a Stripe billing-portal session for that customer (`returnUrl` = `client.url`) and returns its URL |
| POST | `/webhooks/payment` | raw body + `Stripe-Signature` header | 200 (or 500 on a signature failure — see Project Status "Known gaps") | **Real**, 2026-05-02 — verifies the signature via `Webhook.constructEvent(payload, sigHeader, webhookSecret)`, deserializes the event (falling back to `deserializeUnsafe()` if the typed deserializer comes back empty), pulls `metadata` off the object when it's a checkout `Session`, and forwards `(type, object, metadata)` to `PaymentProcessor.handleWebhookEvent` — which dispatches by event type to the matching `SubscriptionService` method (`activateSubscription`, `updateSubscription`, `cancelSubscription`, `renewSubscriptionPeriod`, `markSubscriptionPastDue`). Permitted by `WebSecurityConfig`'s existing `/webhooks/**` rule — no JWT, since Stripe can't send one; the signature check *is* the authentication |

An earlier version of this controller had a `/webhooks/payment` handler and a `PaymentProcessor` dependency that didn't exist anywhere in the repo and referenced unimported Stripe SDK types — it didn't compile, and was removed entirely. The webhook handler and `PaymentProcessor` added 2026-05-02 are a from-scratch, working implementation, unrelated to that earlier attempt beyond the URL.

## UsageController (`/api/usage`)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/api/usage/today` | — | `UsageTodayResponse` (`tokensUsed`, `tokensLimit`, `previewsRunning`, `previewsLimit`) | Stub |
| GET | `/api/usage/limits` | — | `PlanLimitsResponse` (`planName`, `maxTokensPerDay`, `maxProjects`, `unlimitedAi`) | Stub |

## ChatController (`/api/chat`)

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/api/chat/stream` | `ChatRequest` (`message`, `projectId`, `@Valid`) | SSE stream of `StreamResponse` (`text`) | **Real**, 2026-05-16 — delegates to `AiGenerationService.streamResponse`, gated by `@PreAuthorize("@security.canEditProject(#projectId)")` on the service method (not the controller). `ChatRequest` gained Bean Validation (`@NotBlank`/`@NotNull`) in a later 2026-05-16 pass, closing the gap noted below — validation runs before the SSE stream starts, so a rejected request still gets a clean JSON 400 rather than a content-type mismatch on an already-committed stream. A mid-stream 429 from the AI provider (after retries are exhausted) now surfaces to the client as a specific "the AI provider is currently rate-limited" message instead of a generic one |
| GET | `/api/chat/projects/{projectId}` | — | `List<ChatResponse>` | **Real**, 2026-05-16 — `ChatService.getProjectChatHistory`, now `@PreAuthorize("@security.canViewProject(#projectId)")`-gated (later 2026-05-16 pass, closing the gap noted below) instead of relying only on the self-scoped `(projectId, callerId)` lookup. A project with no chat session yet returns an empty list (uses `findById` now, not `getReferenceById`, which used to throw lazily on first access to the unresolved proxy) |

## Request Validation

All 7 request DTOs (every DTO actually used as a `@RequestBody`) now carry Bean Validation constraints; response DTOs never do. `ChatRequest` (2026-05-16, see [ChatController](#chatcontroller-apichat)) was the last holdout — gained `@NotBlank`/`@NotNull` and `@Valid` on the controller parameter in a later 2026-05-16 pass, closing the gap this section used to flag.

| DTO | Field | Constraints |
|---|---|---|
| `SignupRequest` | `username` | `@NotBlank`, `@Email` *(field is called `username`, but still validated as email-shaped — see note below)* |
| | `name` | `@NotBlank`, `@Size(min = 1, max = 30)` |
| | `password` | `@NotBlank`, `@Size(min = 8)` |
| `LoginRequest` | `username` | `@NotBlank`, `@Email` |
| | `password` | `@NotBlank`, `@Size(min = 8, message = "Password must be at least 8 characters long")` |
| `ProjectRequest` | `name` | `@NotBlank`, `@Size(max = 255)` |
| `InviteMemberRequest` | `username` | `@NotBlank`, `@Email` |
| | `role` | `@NotNull` |
| `UpdateMemberRoleRequest` | `role` | `@NotNull` |
| `CheckoutRequest` | `planId` | `@NotNull` |
| `ChatRequest` | `message` | `@NotBlank` |
| | `projectId` | `@NotNull` |

All 6 DTOs were renamed from `email` to `username` on 2026-04-26, matching the `User` entity's field rename (`email`/`passwordHash` → `username`/`password`, see [Differences from v3](../schema/README.md#differences-from-v3)). The `@Email` constraint on `username`/`SignupRequest.username`/`InviteMemberRequest.username` was kept as-is through the rename, so these fields are still validated as email-shaped despite the field name — the `@Email` messages were updated to say "must be a valid username address" (grammatically odd, kept verbatim since it's what's actually in the code) rather than being dropped.

`LoginRequest.password` gained a `@Size(min = 8)` on 2026-04-26, reversing an earlier, explicitly-documented decision to leave it unconstrained (login shouldn't reject a password based on shape, only presence — that's what `SignupRequest.password`'s `@Size(min = 8)` is for). Flagged, not reverted, since it's unclear whether this was deliberate. It gained an explicit `message` 2026-05-16 (later pass), closing the gap this note used to flag — every constraint in the codebase now has one.
