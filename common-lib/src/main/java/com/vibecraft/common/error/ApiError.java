package com.vibecraft.common.error;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * One error response shape for every service.
 *
 * <p>Handles: the status, message and timestamp every failure carries, a requestId every failure also carries, and
 * the three fields that appear only where they apply - per-field validation errors, quota numbers on a 402, and a
 * machine-readable code.
 *
 * <p>The code field exists for the one case a status cannot settle: two different failures that share it. A 503 is
 * both "every preview runner is busy" and "the cluster did not answer", and a client that must react differently to
 * those cannot be made to read the message. Only those errors carry a code; everything else omits the field.
 *
 * <p>requestId is a fresh random id, not a correlation id threaded from an incoming header or a distributed trace -
 * this codebase has neither (docs/known-gaps/constraints-and-trade-offs.md §8). It exists so a user can quote one opaque, non-sensitive value
 * to support, and support can find the matching log line: GlobalExceptionHandler always logs {@code apiError} itself,
 * so every id that reaches a client also reaches the log, for free, with no separate correlation wiring.
 */
public record ApiError(
        HttpStatus status,
        String message,
        Instant timestamp,
        String requestId,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<ApiFieldError> errors,
        @JsonInclude(JsonInclude.Include.NON_NULL) QuotaDetails quota,
        @JsonInclude(JsonInclude.Include.NON_NULL) String code
) {
    public static final String CAPACITY_UNAVAILABLE = "CAPACITY_UNAVAILABLE";

    public static final String UPSTREAM_UNAVAILABLE = "UPSTREAM_UNAVAILABLE";

    public ApiError(HttpStatus status, String message) {
        this(status, message, Instant.now(), newRequestId(), null, null, null);
    }

    public ApiError(HttpStatus status, String message, List<ApiFieldError> errors) {
        this(status, message, Instant.now(), newRequestId(), errors, null, null);
    }

    public ApiError(HttpStatus status, String message, QuotaDetails quota) {
        this(status, message, Instant.now(), newRequestId(), null, quota, null);
    }

    public static ApiError withCode(HttpStatus status, String message, String code) {
        return new ApiError(status, message, Instant.now(), newRequestId(), null, null, code);
    }

    private static String newRequestId() {
        return UUID.randomUUID().toString();
    }

    public record ApiFieldError(String field, String message) {
    }
}
