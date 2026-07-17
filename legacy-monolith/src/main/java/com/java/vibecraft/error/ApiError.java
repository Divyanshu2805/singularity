package com.java.vibecraft.error;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.List;

public record ApiError(
        HttpStatus status,
        String message,
        Instant timestamp,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<ApiFieldError> errors,
        /**
         * Present only on a 402, where the client needs the numbers rather than the sentence - see
         * {@link QuotaDetails}. Every error response stays one shape; this is an extra field on it, not a
         * second one.
         */
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
}

record ApiFieldError(String field, String message){}