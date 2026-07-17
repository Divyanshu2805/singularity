package com.java.vibecraft.dto.usage;

import java.util.Map;

/**
 * One bar of the usage chart - a day, or an hour on the Today view.
 *
 * <p>{@code byFeature} holds only features that were used in that bucket. {@code unattributed} is what the daily
 * counter recorded beyond the ledger - usage from before per-call tracking existed, which can't honestly be
 * assigned to a feature - so {@code total} always matches what the quota counted.
 */
public record UsageSeriesPoint(
        /** ISO date for a day, or "HH:00" for an hour. */
        String key,
        Map<String, Long> byFeature,
        long unattributed,
        long total,
        /** True when the bucket's total reached the current plan's daily limit (days only). */
        boolean limitReached
) {
}
