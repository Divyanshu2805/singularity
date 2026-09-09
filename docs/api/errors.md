# Errors

Every error response from every service has the same JSON shape, produced by one handler: `common-lib`'s `GlobalExceptionHandler`. For example, a Free-plan user who has spent the day's AI budget receives:

```json
{
  "status": 402,
  "message": "You've used today's AI allowance on the Free plan. It refills at midnight, or you can upgrade for a bigger daily budget.",
  "timestamp": "2026-09-08T10:15:30",
  "requestId": "3f6c2a1e-8b1d-4f0e-9a52-7d4f7c1e2b90",
  "quota": { "reason": "DAILY_TOKENS", "limit": 5000, "used": 5000, "resetsAt": "2026-09-09T00:00:00Z", "planName": "Free" }
}
```

| Field | Present | Meaning |
|---|---|---|
| `status`, `message`, `timestamp` | Always | The HTTP status, a human-readable message, and when it happened. |
| `requestId` | Always | A random id, unique per error. The full error is logged with it, so a user can quote one opaque value that matches a server log line. |
| `errors` | Validation failures (`400`) | `[{ field, message }]` for every invalid field. |
| `quota` | `402` only | `{ reason, limit, used, resetsAt?, planName }`. `reason` is `DAILY_TOKENS`, `PROJECT_LIMIT` or `PREVIEW_LIMIT`. |
| `code` | Some `503`s | `CAPACITY_UNAVAILABLE` (nothing free right now, retry shortly — the message is specific) or `UPSTREAM_UNAVAILABLE` (a dependency failed — the message is deliberately generic and the cause is in the server log). |

**Client guidance:** branch on `status` and on the presence of `quota` or `code`; never parse `message`. A bare `503` with neither comes from the Gateway or a development proxy, not from a service.

## Exception mapping

Client-fault statuses log at `WARN` with the message only. Only genuine server faults log at `ERROR` with a stack trace, so real failures aren't buried.

| Exception | Status | Meaning | Log |
|---|---|---|---|
| `ResourceNotFoundException` | 404 | Entity not found. For projects, see [403 vs 404](../known-gaps/api-behavior.md). | WARN |
| `ForbiddenException` | 403 | An explicit business-rule refusal (e.g. forking your own project). | WARN |
| `AuthorizationDeniedException` | 403 | A `@PreAuthorize` denial. | WARN |
| `CsrfException` | 403 | Missing or mismatched `X-XSRF-TOKEN` on a write. | WARN + cause |
| `AccessDeniedException` | 403 | Any other security-chain denial. | WARN |
| `AuthenticationException` | 401 | Not signed in, or the session is invalid. | WARN |
| `JwtException` | 401 | An invalid or expired internal token. | WARN + cause |
| `MethodArgumentNotValidException` | 400 | Validation failed — `errors[]` lists every field. | WARN |
| `BadRequestException` | 400 | A client-fault business rule. | WARN |
| `MethodArgumentTypeMismatchException` | 400 | A path or query parameter couldn't be converted to its type. | WARN |
| `MissingServletRequestParameterException` | 400 | A required query parameter was absent. | WARN |
| `MissingRequestHeaderException` | 400 | A required header was absent (e.g. `Stripe-Signature`). | WARN |
| `HttpMessageNotReadableException` | 400 | Malformed request body. | WARN + cause |
| `QuotaExceededException` | **402** | A plan limit was reached — carries `quota`. Not a `400` (the request was valid) nor a `403` (not a permission problem). | WARN |
| `NoResourceFoundException` | 404 | A URL the service doesn't serve. The path is not echoed back. | WARN |
| `HttpRequestMethodNotSupportedException` | 405 | Right URL, wrong method; includes the `Allow` header. | WARN |
| `ConflictException` | 409 | A state conflict (e.g. a second generation for the same project). | WARN |
| `DataIntegrityViolationException` | 409 | A database constraint violation. Logged with its cause chain, which names the constraint. | WARN + trace |
| `HttpMediaTypeNotSupportedException` | 415 | A body in a content type the endpoint doesn't accept. | WARN |
| `RateLimitExceededException` | 429 | Rate limit exceeded; includes `Retry-After`. | WARN |
| `CapacityUnavailableException` | 503 | No free capacity right now (every preview runner is busy). `code: CAPACITY_UNAVAILABLE`. | WARN |
| `FileStorageException` | 503 | Object storage failed. `code: UPSTREAM_UNAVAILABLE`. | **ERROR + trace** |
| `ExternalServiceException` | 503 | A dependency failed: Firebase, Stripe, OpenRouter, another service, or the Kubernetes cluster. `code: UPSTREAM_UNAVAILABLE`. | **ERROR + trace** |
| `Exception` (anything else) | 500 | Unexpected. | **ERROR + trace** |

## Errors inside a stream

Once a server-sent-event stream has started, a failure can't change the status code; it arrives as an SSE `error` event instead. See [Streaming](streaming.md#errors-after-the-stream-starts).
