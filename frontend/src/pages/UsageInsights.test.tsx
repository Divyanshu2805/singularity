import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { UsageInsights as Insights } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: {
    getUsageInsights: vi.fn(),
    getUsageEvents: vi.fn(),
    exportUsageCsv: vi.fn(),
    getMySubscription: vi.fn(async () => ({ isFree: true, status: null, plan: { id: 2, name: "Free", isFree: true } })),
    getUsageToday: vi.fn(async () => ({
      tokensUsed: 4_000, tokensLimit: 5_000, previewsRunning: 0, previewsLimit: 0, projectsUsed: 1, projectsLimit: 1,
      resetsAt: new Date(Date.now() + 3_600_000).toISOString(), planName: "Free",
    })),
    getProjects: vi.fn(async () => []),
  },
  isAuthenticated: () => true,
  loginRedirectPath: () => "/login",
  getUserInfo: () => ({ id: 1, username: "a@b.c", name: "Test" }),
  signOut: vi.fn(),
}));

vi.mock("@/components/AppSidebar", () => ({
  AppSidebar: () => null,
  SidebarSpacer: () => null,
  SidebarToggleSpace: () => null,
}));

import { api } from "@/lib/api";
import { UsageInsights } from "./UsageInsights";

const insights = (over: Partial<Insights> = {}): Insights => ({
  range: "7d",
  from: "2026-09-10",
  to: "2026-09-16",
  dailyLimit: 5_000,
  planName: "Free",
  totals: { inputTokens: 3_000, outputTokens: 7_000, totalTokens: 12_000, requests: 5 },
  averagePerDay: 1_714,
  peakDay: { date: "2026-09-16", totalTokens: 6_000 },
  daysAtLimit: 1,
  series: [
    { key: "2026-09-15", byFeature: { BUILD: 4_000 }, unattributed: 2_000, total: 6_000, limitReached: true },
    { key: "2026-09-16", byFeature: { BUILD: 5_000, EXPLAIN: 1_000 }, unattributed: 0, total: 6_000, limitReached: true },
  ],
  byFeature: [
    { feature: "BUILD", totalTokens: 9_000, requests: 3, share: 0.75 },
    { feature: "UNATTRIBUTED", totalTokens: 2_000, requests: 0, share: 0.167 },
    { feature: "EXPLAIN", totalTokens: 1_000, requests: 2, share: 0.083 },
  ],
  byProject: [
    { projectId: 7, name: "Blog", deleted: false, totalTokens: 8_000, share: 0.667 },
    { projectId: 9, name: "Old shop", deleted: true, totalTokens: 2_000, share: 0.167 },
  ],
  ...over,
});

async function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter>
          <UsageInsights />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

describe("UsageInsights page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(api.getUsageInsights).mockResolvedValue(insights());
    vi.mocked(api.getUsageEvents).mockResolvedValue({
      events: [
        { id: 1, createdAt: "2026-09-16T08:00:00Z", projectId: 7, projectName: "Blog", feature: "BUILD", inputTokens: 2_000, outputTokens: 3_000, totalTokens: 5_000 },
        { id: 2, createdAt: "2026-09-16T07:00:00Z", projectId: null, projectName: null, feature: "IDEA_INTERVIEW", inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      ],
      page: 0,
      size: 25,
      hasMore: false,
    });
  });

  it("lays out the headline figures, breakdowns and activity", async () => {
    await renderPage();
    await screen.findByText("Tokens by day");

    expect(screen.getByText("12,000")).toBeTruthy(); // this period
    expect(screen.getByText("Days at limit")).toBeTruthy();
    expect(screen.getByText(/daily limit of 5,000/)).toBeTruthy();
    // Earlier activity is named honestly, not folded into a feature.
    expect(screen.getAllByText("Earlier activity").length).toBeGreaterThan(0);
    expect(screen.getByText("Old shop")).toBeTruthy();
    expect(screen.getByText("deleted")).toBeTruthy();
    expect(screen.getByText("70%")).toBeTruthy(); // output share
    expect(await screen.findByText("Idea interview")).toBeTruthy();
  });

  it("nudges a free user who hit the limit toward upgrading", async () => {
    await renderPage();
    expect(await screen.findByText(/hit the free plan's daily limit on 1 day/)).toBeTruthy();
  });

  it("switches range and remembers it", async () => {
    await renderPage();
    await screen.findByText("Tokens by day");

    vi.mocked(api.getUsageInsights).mockResolvedValue(insights({ range: "30d" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "30 days" }));
    });

    await waitFor(() => expect(api.getUsageInsights).toHaveBeenCalledWith("30d"));
    expect(localStorage.getItem("usage_insights_range")).toBe("30d");
  });

  it("shows an empty state instead of a flat chart when nothing was used", async () => {
    vi.mocked(api.getUsageInsights).mockResolvedValue(insights({
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requests: 0 },
      series: [], byFeature: [], byProject: [], peakDay: null, daysAtLimit: 0,
    }));
    await renderPage();
    expect(await screen.findByText(/No AI usage in this period/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Export CSV/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
