package com.vibecraft.common.error;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.List;

/** One error shape for every service. A field is present only where it applies — see the constructors. */
public record ApiError(
        HttpStatus status,
        String message,
        Instant timestamp,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<ApiFieldError> errors,
        @JsonInclude(JsonInclude.Include.NON_NULL) QuotaDetails quota
) {
    public ApiError(HttpStatus status, String message) {
        this(status, message, Instant.now(), null, null);
    }

    public ApiError(HttpStatus status, String message, List<ApiFieldError> errors) {
        this(status, message, Instant.now(), errors, null);
    }

    public ApiError(HttpStatus status, String message, QuotaDetails quota) {
        this(status, message, Instant.now(), null, quota);
    }

    public record ApiFieldError(String field, String message) {
    }
}
