package com.vibecraft.intelligence.dto.usage;

import java.util.List;

/**
 * Everything the usage insights page draws for one range.
 *
 * <p>Handles: the totals, the per-bucket series, the per-feature and per-project breakdowns and the peak day. Always
 * about the caller's own usage.
 *
 * <p>Buckets are days, or hours on the today view, in the server's zone - the same zone the daily quota counter rolls
 * over in - so a bar here and the quota meter never disagree about which day tokens belong to.
 */
public record UsageInsightsResponse(
        String range,
        String from,
        String to,
        int dailyLimit,
        String planName,
        UsageTotals totals,
        long averagePerDay,
        DayUsage peakDay,
        int daysAtLimit,
        List<UsageSeriesPoint> series,
        List<FeatureUsage> byFeature,
        List<ProjectUsage> byProject
) {
}
