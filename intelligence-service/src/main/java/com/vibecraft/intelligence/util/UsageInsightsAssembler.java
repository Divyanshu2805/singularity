package com.vibecraft.intelligence.util;

import com.vibecraft.intelligence.dto.usage.DayUsage;
import com.vibecraft.intelligence.dto.usage.FeatureUsage;
import com.vibecraft.intelligence.dto.usage.ProjectUsage;
import com.vibecraft.intelligence.dto.usage.UsageInsightsResponse;
import com.vibecraft.intelligence.dto.usage.UsageSeriesPoint;
import com.vibecraft.intelligence.dto.usage.UsageTotals;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Turns grouped ledger rows into the insights response.
 *
 * <p>Handles: filling in empty buckets so a quiet day is still a bar, summing per feature and per project, working
 * out each share, finding the peak day, and adding the remainder the daily counter holds beyond the ledger as an
 * unattributed bucket so the totals match what the quota counted.
 *
 * <p>Pure - no repositories, no clock - so the parts that are easy to get quietly wrong are unit-tested directly. The
 * grouping itself happens in the database; this only arranges the result.
 */
public final class UsageInsightsAssembler {

    public static final String UNATTRIBUTED = "UNATTRIBUTED";

    private UsageInsightsAssembler() {
    }

    public record Row(String bucket, String feature, Long projectId, long input, long output, long total, long requests) {
    }

    public record ProjectInfo(String name, boolean deleted) {
    }

    public static UsageInsightsResponse days(String range, LocalDate from, LocalDate to, List<Row> rows,
                                             Map<LocalDate, Long> dailyTotals, int dailyLimit, String planName,
                                             Map<Long, ProjectInfo> projects) {
        Map<String, Map<String, Long>> byBucket = new HashMap<>();
        rows.forEach(row -> byBucket.computeIfAbsent(row.bucket(), key -> new HashMap<>())
                .merge(row.feature(), row.total(), Long::sum));

        List<UsageSeriesPoint> series = new ArrayList<>();
        long unattributedTotal = 0;
        int daysAtLimit = 0;
        DayUsage peak = null;

        for (LocalDate day = from; !day.isAfter(to); day = day.plusDays(1)) {
            String key = day.toString();
            Map<String, Long> features = ordered(byBucket.getOrDefault(key, Map.of()));
            long ledger = features.values().stream().mapToLong(Long::longValue).sum();
            long counted = dailyTotals.getOrDefault(day, 0L);
            long unattributed = Math.max(0, counted - ledger);
            long total = ledger + unattributed;
            boolean atLimit = dailyLimit > 0 && total >= dailyLimit;

            unattributedTotal += unattributed;
            if (atLimit) daysAtLimit++;
            if (total > 0 && (peak == null || total > peak.totalTokens())) peak = new DayUsage(key, total);
            series.add(new UsageSeriesPoint(key, features, unattributed, total, atLimit));
        }

        UsageTotals totals = totals(rows, unattributedTotal);
        long days = series.size();
        long average = days == 0 ? 0 : Math.round((double) totals.totalTokens() / days);

        return new UsageInsightsResponse(range, from.toString(), to.toString(), dailyLimit, planName, totals, average,
                peak, daysAtLimit, series, byFeature(rows, unattributedTotal, totals.totalTokens()),
                byProject(rows, projects, totals.totalTokens()));
    }

    public static UsageInsightsResponse hours(LocalDate today, List<Row> rows, long countedToday, int dailyLimit,
                                              String planName, Map<Long, ProjectInfo> projects) {
        Map<String, Map<String, Long>> byBucket = new HashMap<>();
        rows.forEach(row -> byBucket.computeIfAbsent(row.bucket(), key -> new HashMap<>())
                .merge(row.feature(), row.total(), Long::sum));

        List<UsageSeriesPoint> series = new ArrayList<>();
        for (int hour = 0; hour < 24; hour++) {
            String key = String.format("%02d:00", hour);
            Map<String, Long> features = ordered(byBucket.getOrDefault(key, Map.of()));
            long total = features.values().stream().mapToLong(Long::longValue).sum();
            series.add(new UsageSeriesPoint(key, features, 0, total, false));
        }

        long ledger = rows.stream().mapToLong(Row::total).sum();
        long unattributed = Math.max(0, countedToday - ledger);
        UsageTotals totals = totals(rows, unattributed);
        DayUsage peak = totals.totalTokens() > 0 ? new DayUsage(today.toString(), totals.totalTokens()) : null;

        return new UsageInsightsResponse("today", today.toString(), today.toString(), dailyLimit, planName, totals,
                totals.totalTokens(), peak, dailyLimit > 0 && totals.totalTokens() >= dailyLimit ? 1 : 0, series,
                byFeature(rows, unattributed, totals.totalTokens()), byProject(rows, projects, totals.totalTokens()));
    }

    private static UsageTotals totals(List<Row> rows, long unattributed) {
        long input = 0, output = 0, total = 0, requests = 0;
        for (Row row : rows) {
            input += row.input();
            output += row.output();
            total += row.total();
            requests += row.requests();
        }
        return new UsageTotals(input, output, total + unattributed, requests);
    }

    private static List<FeatureUsage> byFeature(List<Row> rows, long unattributed, long grandTotal) {
        Map<String, long[]> sums = new HashMap<>();
        rows.forEach(row -> {
            long[] acc = sums.computeIfAbsent(row.feature(), key -> new long[2]);
            acc[0] += row.total();
            acc[1] += row.requests();
        });
        if (unattributed > 0) sums.put(UNATTRIBUTED, new long[]{unattributed, 0});

        return sums.entrySet().stream()
                .map(e -> new FeatureUsage(e.getKey(), e.getValue()[0], e.getValue()[1], share(e.getValue()[0], grandTotal)))
                .sorted(Comparator.comparingLong(FeatureUsage::totalTokens).reversed())
                .toList();
    }

    private static List<ProjectUsage> byProject(List<Row> rows, Map<Long, ProjectInfo> projects, long grandTotal) {
        Map<Long, Long> sums = new HashMap<>();
        rows.stream().filter(row -> row.projectId() != null)
                .forEach(row -> sums.merge(row.projectId(), row.total(), Long::sum));

        return sums.entrySet().stream()
                .map(e -> {
                    ProjectInfo info = projects.get(e.getKey());
                    return new ProjectUsage(e.getKey(), info == null ? "Deleted project" : info.name(),
                            info == null || info.deleted(), e.getValue(), share(e.getValue(), grandTotal));
                })
                .sorted(Comparator.comparingLong(ProjectUsage::totalTokens).reversed())
                .toList();
    }

    private static Map<String, Long> ordered(Map<String, Long> features) {
        return new LinkedHashMap<>(new TreeMap<>(features));
    }

    private static double share(long part, long whole) {
        return whole <= 0 ? 0 : Math.round((double) part / whole * 1000) / 1000.0;
    }
}
