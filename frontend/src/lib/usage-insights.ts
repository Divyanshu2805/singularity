import type { UsageFeature, UsageInsights, UsageRange, UsageSeriesPoint } from "./types";

/**
 * How usage is named, coloured and arranged for the insights page and the chat meter.
 *
 * <p>Pure on purpose, like `billing.ts`: the parts worth getting exactly right - a stacked bar's segments summing
 * to the quota, a share that doesn't read 99% because of rounding, a date label that doesn't shift a day in
 * another timezone - are tested here without rendering a chart.
 */

export interface FeatureMeta {
  label: string;
  /** One line for the legend tooltip and the breakdown list. */
  description: string;
  color: string;
}

/**
 * Stack order is fixed (bottom to top) so a segment is always in the same place from day to day, and Build sits
 * at the bottom because it is nearly always the biggest. Colours: the brand copper for Build, and distinct hues for
 * the rest that stay readable on the dark panel; "earlier activity" is a neutral grey because it isn't a feature.
 */
export const FEATURES: Record<UsageFeature, FeatureMeta> = {
  BUILD: { label: "Build", description: "Messages in the project chat", color: "hsl(22 90% 55%)" },
  BUILD_RETRY: { label: "Build retry", description: "Automatic second attempts at an unfinished build", color: "hsl(38 95% 60%)" },
  EXPLAIN: { label: "ExplainLLM", description: "Explaining and answering questions about code", color: "hsl(199 80% 58%)" },
  IDEA_INTERVIEW: { label: "Idea interview", description: "Questions and the brief before a project starts", color: "hsl(275 65% 68%)" },
  PROJECT_NAMING: { label: "Project naming", description: "Naming a new project from its idea", color: "hsl(152 55% 50%)" },
  UNATTRIBUTED: {
    label: "Earlier activity",
    description: "Usage from before per-request tracking, which can't be split by feature",
    color: "hsl(220 8% 48%)",
  },
};

export const FEATURE_ORDER: UsageFeature[] = ["BUILD", "BUILD_RETRY", "EXPLAIN", "IDEA_INTERVIEW", "PROJECT_NAMING", "UNATTRIBUTED"];

export const RANGES: { value: UsageRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

export const featureLabel = (feature: string) => FEATURES[feature as UsageFeature]?.label ?? feature;

/** A chart row: the bucket's label plus one numeric key per feature, with every feature present (zero if unused). */
export type ChartRow = { key: string; label: string; total: number; limitReached: boolean } & Record<UsageFeature, number>;

export function toChartRows(insights: UsageInsights): ChartRow[] {
  return insights.series.map((point) => {
    const row = {
      key: point.key,
      label: bucketLabel(point, insights.range),
      total: point.total,
      limitReached: point.limitReached,
    } as ChartRow;
    for (const feature of FEATURE_ORDER) {
      row[feature] = feature === "UNATTRIBUTED" ? point.unattributed : point.byFeature[feature] ?? 0;
    }
    return row;
  });
}

/** Features that actually appear in the window - a legend listing five empty colours is noise. */
export function featuresInUse(insights: UsageInsights): UsageFeature[] {
  const used = new Set(insights.byFeature.filter((entry) => entry.totalTokens > 0).map((entry) => entry.feature));
  return FEATURE_ORDER.filter((feature) => used.has(feature));
}

/**
 * The x-axis label. A day key is a plain calendar date ("2026-09-16") already bucketed in the server's zone, so it
 * is formatted as a calendar date - parsing it with `new Date("2026-09-16")` would read it as UTC midnight and show
 * the previous day to anyone west of Greenwich.
 */
export function bucketLabel(point: Pick<UsageSeriesPoint, "key">, range: UsageRange): string {
  if (range === "today") return point.key;
  const [year, month, day] = point.key.split("-").map(Number);
  if (!year || !month || !day) return point.key;
  const date = new Date(year, month - 1, day);
  return range === "7d"
    ? date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** "12.4k", "1.2M" - for axis ticks and tight tiles. Full numbers stay in tooltips and tables. */
export function compactTokens(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${trim(value / 1_000_000)}M`;
  if (abs >= 1_000) return `${trim(value / 1_000)}k`;
  return String(Math.round(value));
}

const trim = (value: number) => (Math.round(value * 10) / 10).toString();

/**
 * "62%", "<1%" - a share that rounds to zero but isn't zero reads as "less than one percent" rather than as
 * nothing, which would contradict the non-empty bar next to it.
 */
export function formatShare(share: number): string {
  if (!share || share <= 0) return "0%";
  const percent = share * 100;
  if (percent < 1) return "<1%";
  return `${Math.round(percent)}%`;
}

/**
 * Average tokens per AI call - the "how heavy is a typical request" figure. Divided from attributed tokens only
 * (input + output): `totalTokens` also holds earlier activity, which has no request count, and dividing that by
 * tracked requests would inflate the average.
 */
export const tokensPerRequest = (totals: UsageInsights["totals"]) =>
  totals.requests > 0 ? Math.round((totals.inputTokens + totals.outputTokens) / totals.requests) : 0;

/** The output share of attributed tokens: output is what a long build or a teaching walkthrough spends. */
export function outputShare(totals: UsageInsights["totals"]): number {
  const attributed = totals.inputTokens + totals.outputTokens;
  return attributed > 0 ? totals.outputTokens / attributed : 0;
}

/** "Peak day" / "Busiest hour" wording and value, so the tile reads right on the Today view too. */
export function peakLabel(insights: UsageInsights): { title: string; value: string } {
  if (insights.range === "today") {
    const busiest = [...insights.series].sort((a, b) => b.total - a.total)[0];
    return { title: "Busiest hour", value: busiest && busiest.total > 0 ? busiest.key : "—" };
  }
  if (!insights.peakDay) return { title: "Peak day", value: "—" };
  return { title: "Peak day", value: bucketLabel({ key: insights.peakDay.date }, "30d") };
}
