package com.vibecraft.common.error;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;

/**
 * The numbers carried on a 402, so the client gets more than a sentence.
 *
 * <p>Handles: which limit tripped, the limit and the amount used, when the allowance refills (null for a limit that
 * does not reset on a clock, like project count), and the plan the limit came from so the UI can say what upgrading
 * would buy.
 */
public record QuotaDetails(
        String reason,
        int limit,
        int used,
        @JsonInclude(JsonInclude.Include.NON_NULL) Instant resetsAt,
        String planName
) {
}
