package com.vibecraft.common.error;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;

/**
 * Extra shape carried on a 402 {@link ApiError} so the client gets the numbers, not just a sentence.
 * Shared across domains on purpose: the limit itself is always Account's (a {@code Plan} field), but the
 * thing being counted is Workspace's (projects, previews) or Intelligence's (daily tokens) depending on
 * which quota tripped.
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
