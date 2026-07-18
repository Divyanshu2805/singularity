package com.vibecraft.intelligence.dto.usage;

import java.util.List;

/**
 * Everything the usage insights page draws for one range. Always about the caller's own usage.
 *
 * <p>Buckets are days (or, for {@code today}, hours) in the server's zone - the same zone the daily quota counter
 * rolls over in - so a bar here and the quota meter never disagree about which day tokens belong to.
 */
public record UsageInsightsResponse(
        /** "today", "7d", "30d" or "90d". */
        String range,
        String from,
        String to,
        /** The caller's current plan's daily limit - drawn as the reference line. */
        int dailyLimit,
        String planName,
        UsageTotals totals,
        long averagePerDay,
        DayUsage peakDay,
        /** Days in the window whose total reached today's limit. Judged against the current plan. */
        int daysAtLimit,
        List<UsageSeriesPoint> series,
        List<FeatureUsage> byFeature,
        List<ProjectUsage> byProject
) {
}
