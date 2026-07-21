package com.vibecraft.common.error;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.List;

/**
 * One error shape for every service. A field is present only where it applies — see the constructors.
 *
 * <p>{@code code} exists for the one case a status can't settle: two different failures that share it. A 503 is
 * both "every preview runner is busy" and "the cluster didn't answer", and a client that has to react differently
 * must not learn which by reading {@code message}. Only those errors carry one; everything else omits the field.
 */
public record ApiError(
        HttpStatus status,
        String message,
        Instant timestamp,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<ApiFieldError> errors,
        @JsonInclude(JsonInclude.Include.NON_NULL) QuotaDetails quota,
        @JsonInclude(JsonInclude.Include.NON_NULL) String code
) {
    /** {@link #code}: nothing is wrong with the request or the platform - there is just no free capacity right now. */
    public static final String CAPACITY_UNAVAILABLE = "CAPACITY_UNAVAILABLE";

    /** {@link #code}: something this request depends on (cluster, cache, object store, another service) failed. */
    public static final String UPSTREAM_UNAVAILABLE = "UPSTREAM_UNAVAILABLE";

    public ApiError(HttpStatus status, String message) {
        this(status, message, Instant.now(), null, null, null);
    }

    public ApiError(HttpStatus status, String message, List<ApiFieldError> errors) {
        this(status, message, Instant.now(), errors, null, null);
    }

    public ApiError(HttpStatus status, String message, QuotaDetails quota) {
        this(status, message, Instant.now(), null, quota, null);
    }

    /** A named factory rather than a fourth overload, so a stray {@code null} can never be ambiguous between them. */
    public static ApiError withCode(HttpStatus status, String message, String code) {
        return new ApiError(status, message, Instant.now(), null, null, code);
    }

    public record ApiFieldError(String field, String message) {
    }
}
