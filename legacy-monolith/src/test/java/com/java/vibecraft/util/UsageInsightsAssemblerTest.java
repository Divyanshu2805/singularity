package com.java.vibecraft.util;

import com.java.vibecraft.dto.usage.UsageInsightsResponse;
import com.java.vibecraft.dto.usage.UsageSeriesPoint;
import com.java.vibecraft.util.UsageInsightsAssembler.ProjectInfo;
import com.java.vibecraft.util.UsageInsightsAssembler.Row;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** The arrangement of ledger rows into what the insights page draws. */
class UsageInsightsAssemblerTest {

    private static final LocalDate MON = LocalDate.of(2026, 9, 14);
    private static final LocalDate WED = LocalDate.of(2026, 9, 16);
    private static final Map<Long, ProjectInfo> PROJECTS = Map.of(
            1L, new ProjectInfo("Blog", false),
            2L, new ProjectInfo("Old shop", true));

    private static Row row(String day, String feature, Long project, long input, long output, long requests) {
        return new Row(day, feature, project, input, output, input + output, requests);
    }

    @Test
    @DisplayName("gives every day in the window a bar, including the unused ones")
    void fillsEmptyDays() {
        UsageInsightsResponse insights = UsageInsightsAssembler.days("7d", MON, WED,
                List.of(row("2026-09-16", "BUILD", 1L, 1_000, 4_000, 1)), Map.of(), 100_000, "Pro", PROJECTS);

        assertThat(insights.series()).extracting(UsageSeriesPoint::key)
                .containsExactly("2026-09-14", "2026-09-15", "2026-09-16");
        assertThat(insights.series().get(0).total()).isZero();
        assertThat(insights.series().get(2).byFeature()).containsEntry("BUILD", 5_000L);
    }

    @Test
    @DisplayName("reports what the quota counted beyond the ledger as unattributed, so bars match the quota")
    void reconcilesWithTheDailyCounter() {
        UsageInsightsResponse insights = UsageInsightsAssembler.days("7d", MON, MON,
                List.of(row("2026-09-14", "BUILD", 1L, 1_000, 2_000, 1)),
                Map.of(MON, 10_000L), 100_000, "Pro", PROJECTS);

        UsageSeriesPoint day = insights.series().get(0);
        assertThat(day.unattributed()).isEqualTo(7_000);
        // The bar is exactly what the quota counted - never more, never less.
        assertThat(day.total()).isEqualTo(10_000);
        assertThat(insights.totals().totalTokens()).isEqualTo(10_000);
        assertThat(insights.byFeature()).anySatisfy(feature -> {
            assertThat(feature.feature()).isEqualTo(UsageInsightsAssembler.UNATTRIBUTED);
            assertThat(feature.totalTokens()).isEqualTo(7_000);
        });
    }

    @Test
    @DisplayName("never invents negative unattributed usage when the ledger holds more than the counter")
    void neverNegativeUnattributed() {
        UsageInsightsResponse insights = UsageInsightsAssembler.days("7d", MON, MON,
                List.of(row("2026-09-14", "BUILD", 1L, 3_000, 3_000, 1)), Map.of(MON, 1_000L), 100_000, "Pro", PROJECTS);

        assertThat(insights.series().get(0).unattributed()).isZero();
        assertThat(insights.byFeature()).noneMatch(f -> f.feature().equals(UsageInsightsAssembler.UNATTRIBUTED));
    }

    @Test
    @DisplayName("marks days that reached the limit and finds the peak day")
    void limitAndPeak() {
        UsageInsightsResponse insights = UsageInsightsAssembler.days("7d", MON, WED, List.of(
                row("2026-09-14", "BUILD", 1L, 1_000, 4_000, 1),
                row("2026-09-15", "BUILD", 1L, 2_000, 8_000, 2)), Map.of(), 10_000, "Free", PROJECTS);

        assertThat(insights.series()).extracting(UsageSeriesPoint::limitReached).containsExactly(false, true, false);
        assertThat(insights.daysAtLimit()).isEqualTo(1);
        assertThat(insights.peakDay().date()).isEqualTo("2026-09-15");
        assertThat(insights.averagePerDay()).isEqualTo(5_000);
    }

    @Test
    @DisplayName("splits input and output tokens, and ranks features and projects by use")
    void breakdowns() {
        UsageInsightsResponse insights = UsageInsightsAssembler.days("7d", MON, MON, List.of(
                row("2026-09-14", "BUILD", 1L, 1_000, 5_000, 2),
                row("2026-09-14", "EXPLAIN", 2L, 1_500, 500, 3),
                row("2026-09-14", "IDEA_INTERVIEW", null, 1_000, 1_000, 2)), Map.of(), 100_000, "Pro", PROJECTS);

        assertThat(insights.totals().inputTokens()).isEqualTo(3_500);
        assertThat(insights.totals().outputTokens()).isEqualTo(6_500);
        assertThat(insights.totals().requests()).isEqualTo(7);

        assertThat(insights.byFeature().get(0).feature()).isEqualTo("BUILD");
        assertThat(insights.byFeature().get(0).share()).isEqualTo(0.6);

        // Calls with no project aren't forced into a fake "no project" row.
        assertThat(insights.byProject()).hasSize(2);
        assertThat(insights.byProject().get(0).name()).isEqualTo("Blog");
        assertThat(insights.byProject().get(1).deleted()).isTrue();
    }

    @Test
    @DisplayName("keeps stacked segments in a stable order between days")
    void stableFeatureOrder() {
        UsageInsightsResponse insights = UsageInsightsAssembler.days("7d", MON, MON, List.of(
                row("2026-09-14", "PROJECT_NAMING", null, 10, 10, 1),
                row("2026-09-14", "BUILD", 1L, 10, 10, 1),
                row("2026-09-14", "EXPLAIN", 1L, 10, 10, 1)), Map.of(), 100_000, "Pro", PROJECTS);

        assertThat(insights.series().get(0).byFeature().keySet()).containsExactly("BUILD", "EXPLAIN", "PROJECT_NAMING");
    }

    @Test
    @DisplayName("lays today out in 24 hourly buckets")
    void hourly() {
        UsageInsightsResponse insights = UsageInsightsAssembler.hours(WED,
                List.of(row("09:00", "BUILD", 1L, 1_000, 2_000, 1)), 5_000, 100_000, "Pro", PROJECTS);

        assertThat(insights.series()).hasSize(24);
        assertThat(insights.series().get(9).total()).isEqualTo(3_000);
        // No hourly counter to reconcile against: the remainder shows in totals, not in an invented hour.
        assertThat(insights.totals().totalTokens()).isEqualTo(5_000);
    }

    @Test
    @DisplayName("an empty history has no peak day and zero shares, not a division error")
    void emptyHistory() {
        UsageInsightsResponse insights = UsageInsightsAssembler.days("7d", MON, WED, List.of(), Map.of(), 5_000, "Free", Map.of());
        assertThat(insights.peakDay()).isNull();
        assertThat(insights.byFeature()).isEmpty();
        assertThat(insights.averagePerDay()).isZero();
    }
}
