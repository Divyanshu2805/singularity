package com.java.vibecraft.error;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;

/**
 * The numbers behind a 402, carried on {@link ApiError} so the client can render "4,980 of 5,000 used, resets
 * in 6h 12m" without parsing them back out of the message.
 *
 * <p>The message alone would have been enough to *show* something, but not to build a progress bar or a
 * countdown, and a client that scrapes numbers out of English prose breaks the first time the wording changes.
 */
public record QuotaDetails(
        /** Which limit was hit: {@code DAILY_TOKENS}, {@code PROJECT_LIMIT} or {@code PREVIEW_LIMIT}. */
        String reason,
        int limit,
        int used,
        /** When the allowance refills. Null for a limit that doesn't reset on a clock, like project count. */
        @JsonInclude(JsonInclude.Include.NON_NULL) Instant resetsAt,
        /** The plan the limit came from, so the UI can say what upgrading would buy. */
        String planName
) {
}
