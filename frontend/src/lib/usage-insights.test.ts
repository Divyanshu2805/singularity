import { describe, it, expect } from "vitest";
import {
  bucketLabel,
  compactTokens,
  featuresInUse,
  formatShare,
  outputShare,
  peakLabel,
  toChartRows,
  tokensPerRequest,
} from "./usage-insights";
import type { UsageInsights } from "./types";

const insights = (over: Partial<UsageInsights> = {}): UsageInsights => ({
  range: "7d",
  from: "2026-09-15",
  to: "2026-09-16",
  dailyLimit: 100_000,
  planName: "Pro",
  totals: { inputTokens: 3_000, outputTokens: 7_000, totalTokens: 12_000, requests: 5 },
  averagePerDay: 6_000,
  peakDay: { date: "2026-09-16", totalTokens: 9_000 },
  daysAtLimit: 0,
  series: [
    { key: "2026-09-15", byFeature: {}, unattributed: 2_000, total: 2_000, limitReached: false },
    { key: "2026-09-16", byFeature: { BUILD: 8_000, EXPLAIN: 1_000 }, unattributed: 0, total: 9_000, limitReached: false },
  ],
  byFeature: [
    { feature: "BUILD", totalTokens: 8_000, requests: 3, share: 0.667 },
    { feature: "UNATTRIBUTED", totalTokens: 2_000, requests: 0, share: 0.167 },
    { feature: "EXPLAIN", totalTokens: 1_000, requests: 2, share: 0.083 },
  ],
  byProject: [],
  ...over,
});

describe("toChartRows", () => {
  it("gives every row every feature, so stacked segments never go missing", () => {
    const rows = toChartRows(insights());
    expect(rows[0].BUILD).toBe(0);
    expect(rows[0].UNATTRIBUTED).toBe(2_000);
    expect(rows[1].BUILD).toBe(8_000);
    expect(rows[1].EXPLAIN).toBe(1_000);
  });

  it("makes each row's segments add up to the bar's total", () => {
    for (const row of toChartRows(insights())) {
      const sum = row.BUILD + row.BUILD_RETRY + row.EXPLAIN + row.IDEA_INTERVIEW + row.PROJECT_NAMING + row.UNATTRIBUTED;
      expect(sum).toBe(row.total);
    }
  });
});

describe("featuresInUse", () => {
  it("lists only features with usage, in stack order", () => {
    expect(featuresInUse(insights())).toEqual(["BUILD", "EXPLAIN", "UNATTRIBUTED"]);
  });
});

describe("bucketLabel", () => {
  it("does not shift a calendar day into the previous one", () => {
    // new Date("2026-09-16") would be UTC midnight - the 15th for anyone west of Greenwich.
    expect(bucketLabel({ key: "2026-09-16" }, "30d")).toContain("16");
  });

  it("leaves an hour label alone on the Today view", () => {
    expect(bucketLabel({ key: "09:00" }, "today")).toBe("09:00");
  });
});

describe("compactTokens", () => {
  it("shortens big numbers for axis ticks", () => {
    expect(compactTokens(950)).toBe("950");
    expect(compactTokens(12_400)).toBe("12.4k");
    expect(compactTokens(100_000)).toBe("100k");
    expect(compactTokens(2_500_000)).toBe("2.5M");
  });
});

describe("formatShare", () => {
  it("reads a tiny but real share as under one percent, not zero", () => {
    expect(formatShare(0.004)).toBe("<1%");
    expect(formatShare(0)).toBe("0%");
    expect(formatShare(0.667)).toBe("67%");
  });
});

describe("per-request and output figures", () => {
  it("averages attributed tokens only, so earlier activity doesn't inflate it", () => {
    // 3,000 + 7,000 attributed over 5 requests - not the 12,000 total, which includes 2,000 of earlier activity.
    expect(tokensPerRequest(insights().totals)).toBe(2_000);
    expect(tokensPerRequest({ inputTokens: 0, outputTokens: 0, totalTokens: 500, requests: 0 })).toBe(0);
  });

  it("reports the output share of attributed tokens", () => {
    expect(outputShare(insights().totals)).toBeCloseTo(0.7);
  });
});

describe("peakLabel", () => {
  it("names the busiest hour on the Today view", () => {
    const today = insights({
      range: "today",
      series: [
        { key: "09:00", byFeature: { BUILD: 100 }, unattributed: 0, total: 100, limitReached: false },
        { key: "14:00", byFeature: { BUILD: 900 }, unattributed: 0, total: 900, limitReached: false },
      ],
    });
    expect(peakLabel(today)).toEqual({ title: "Busiest hour", value: "14:00" });
  });

  it("shows a dash when there is no usage at all", () => {
    expect(peakLabel(insights({ peakDay: null }))).toEqual({ title: "Peak day", value: "—" });
  });
});
