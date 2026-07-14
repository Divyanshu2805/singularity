# Error Taxonomy

Every error response is the same JSON shape (`ApiError`): `{ status, message, timestamp, errors?, quota? }`. `errors` (a list of `{ field, message }`) appears only on a validation failure; `quota` (`{ reason, limit, used, resetsAt?, planName }`) appears only on a 402. A client should branch on `status` and the presence of `quota`, never on parsing `message` text.

18 handlers in `error/GlobalExceptionHandler.java`, one per exception type — logging follows the status code, not a blanket policy: client-fault 4xx logs at WARN with the message only (three exceptions carry a `(cause: ...)` suffix in the log because their user-facing message is deliberately vague — see below); only genuine server faults log at ERROR with a full stack trace.

| Exception | Status | Meaning | Log |
|---|---|---|---|
| `ResourceNotFoundException` | 404 | Entity not found (or, for a project, not accessible to the caller — see [Known Behavior](../known-gaps/api-behavior.md#known-behavior-worth-knowing-about)). | WARN |
| `ForbiddenException` | 403 | An explicit business-rule refusal (e.g. forking your own project). | WARN |
| `MethodArgumentNotValidException` | 400 | `@Valid` failed — `errors[]` lists every field. | WARN |
| `QuotaExceededException` | **402** | A plan limit was hit — carries `quota`. Not a 400 (the request was well-formed) and not a 403 (not a permission problem). | WARN, with the numbers |
| `ConflictException` | 409 | A generic state conflict, distinct from a DB constraint violation. | WARN |
| `BadRequestException` | 400 | A generic client-fault business rule. | WARN |
| `AuthorizationDeniedException` | 403 | Spring Security's own `@PreAuthorize` denial. | WARN |
| `CsrfException` | 403 | Missing/mismatched `X-XSRF-TOKEN` on a write. | WARN + cause |
| `AccessDeniedException` | 403 | Any other security-chain denial — without this handler it fell through to the catch-all 500. | WARN |
| `RateLimitExceededException` | 429 | Sliding-window rate limit exceeded — response carries `Retry-After`. | WARN |
| `AuthenticationException` | 401 | Spring Security auth failure. | WARN |
| `JwtException` | 401 | Legacy Bearer-token verification failed. Response message is deliberately vague ("Invalid or expired token"); the log still distinguishes expired/malformed/bad-signature via the cause. | WARN + cause |
| `MethodArgumentTypeMismatchException` | 400 | A path/query param couldn't bind to its declared type. | WARN |
| `MissingServletRequestParameterException` | 400 | A required `@RequestParam` was absent (e.g. `files/content` with no `path`). | WARN |
| `HttpMessageNotReadableException` | 400 | Malformed request body (bad JSON). | WARN + cause |
| `DataIntegrityViolationException` | 409 | A DB constraint violation (duplicate, dangling reference). Keeps its stack trace even at WARN — the violated constraint lives in the cause chain, not the generic message. | WARN + trace |
| `FileStorageException` | 503 | MinIO unreachable or failed. | **ERROR + trace** |
| `Exception` (catch-all) | 500 | Anything genuinely unexpected. | **ERROR + trace** |

Only `FileStorageException` (503) and the catch-all (500) log at ERROR — every other status is a client-fault or an expected refusal, not a platform failure, so it doesn't deserve a stack trace burying the genuine 500s in the logs.
