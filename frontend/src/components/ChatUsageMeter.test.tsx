import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/api", () => ({
  api: { getUsageToday: vi.fn(), getMySubscription: vi.fn(async () => ({ isFree: false, plan: { name: "Pro" } })) },
  isAuthenticated: () => true,
}));

import { api } from "@/lib/api";
import { ChatUsageMeter } from "./ChatUsageMeter";
import type { UsageToday } from "@/lib/types";

const inSixHours = () => new Date(Date.now() + 6 * 3_600_000 + 12 * 60_000 + 30_000).toISOString();

const usage = (over: Partial<UsageToday> = {}): UsageToday => ({
  tokensUsed: 50_000,
  tokensLimit: 100_000,
  previewsRunning: 0,
  previewsLimit: 1,
  projectsUsed: 2,
  projectsLimit: 3,
  resetsAt: inSixHours(),
  planName: "Pro",
  projectTokensToday: 12_345,
  lastRequest: { feature: "BUILD", projectId: 7, inputTokens: 2_000, outputTokens: 1_210, totalTokens: 3_210, at: new Date().toISOString() },
  ...over,
});

/**
 * Renders and waits for the usage query to settle. A fixed number of microtask flushes isn't enough - React Query
 * resolves on its own schedule - so this waits for the query to have been answered, then for the meter itself
 * when one is expected to show.
 */
async function renderMeter(data: UsageToday, isStreaming = false, { expectMeter = true } = {}) {
  vi.mocked(api.getUsageToday).mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ChatUsageMeter projectId="7" isStreaming={isStreaming} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  await waitFor(() => expect(client.getQueryState(["usage", "today", "7"])?.status).toBe("success"));
  if (expectMeter) await screen.findByRole("button", { name: /AI tokens used today/ });
  return view;
}

describe("ChatUsageMeter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows used and limit, and when the allowance resets", async () => {
    await renderMeter(usage());
    expect(screen.getByText("50k")).toBeTruthy();
    expect(screen.getByText(/Resets in 6h 12m/)).toBeTruthy();
    // Asked for this project's share, not just the account total.
    expect(api.getUsageToday).toHaveBeenCalledWith("7");
  });

  it("fills the bar in proportion and switches to a warning tone near the limit", async () => {
    const { container, unmount } = await renderMeter(usage({ tokensUsed: 50_000 }));
    const fill = () => container.querySelector<HTMLElement>(".bg-primary, .bg-amber-500")!;
    expect(fill().style.width).toBe("50%");
    expect(fill().className).toContain("bg-primary");
    unmount();

    const warning = await renderMeter(usage({ tokensUsed: 90_000 }));
    const warningFill = warning.container.querySelector<HTMLElement>(".bg-amber-500");
    expect(warningFill?.style.width).toBe("90%");
  });

  it("steps aside once the allowance is spent - the composer's quota banner takes over", async () => {
    const { container } = await renderMeter(usage({ tokensUsed: 100_000 }), false, { expectMeter: false });
    expect(container.textContent).toBe("");
  });

  it("says it will update rather than inventing a number while a reply streams", async () => {
    await renderMeter(usage(), true);
    expect(screen.getByText("Updates after this reply")).toBeTruthy();
    expect(screen.queryByText(/Resets in/)).toBeNull();
  });

  it("opens to the other facts: this project, the last reply, and projects", async () => {
    await renderMeter(usage());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /AI tokens used today/ }));
    });

    expect(screen.getByText("This project today")).toBeTruthy();
    expect(screen.getByText("12,345")).toBeTruthy();
    // The latest call was a build in this very chat, so it reads as "Last reply" with its split.
    expect(screen.getByText("Last reply")).toBeTruthy();
    expect(screen.getByText(/2,000 in · 1,210 out/)).toBeTruthy();
    expect(screen.getByText("2 / 3")).toBeTruthy();
    expect(screen.getByText(/View detailed usage/)).toBeTruthy();
  });

  it("names a last request from elsewhere by what it was, not as this chat's reply", async () => {
    await renderMeter(usage({ lastRequest: { feature: "EXPLAIN", projectId: 9, inputTokens: 100, outputTokens: 50, totalTokens: 150, at: new Date().toISOString() } }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /AI tokens used today/ }));
    });
    expect(screen.getByText("Last request · ExplainLLM")).toBeTruthy();
  });
});
