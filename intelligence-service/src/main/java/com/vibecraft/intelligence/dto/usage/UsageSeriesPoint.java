package com.vibecraft.intelligence.dto.usage;

import java.util.Map;

/**
 * One bar of the usage chart - a day, or an hour on the today view.
 *
 * <p>Handles: the bucket's total and its split by feature, which holds only features actually used in that bucket.
 *
 * <p>The unattributed figure is what the daily counter recorded beyond the ledger - usage from before per-call
 * tracking existed, which cannot honestly be assigned to a feature - so the total always matches what the quota
 * counted.
 */
public record UsageSeriesPoint(
        String key,
        Map<String, Long> byFeature,
        long unattributed,
        long total,
        boolean limitReached
) {
}
