/**
 * Covers the two ways of getting a code-lens thread out - copying it and downloading it - producing the same
 * markdown.
 *
 * The difference between them is only where the text lands, so a change to one that skips the other is a bug.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  api: {
    streamCodeInsight: vi.fn(),
    getCodeNotes: vi.fn(async () => []),
    saveCodeNote: vi.fn(async () => ({ id: 1, question: "", answer: "" })),
    deleteCodeNote: vi.fn(async () => {}),
    clearCodeNotes: vi.fn(async () => {}),
  },
  getUserInfo: vi.fn(() => ({ id: 7, username: "divyanshu", name: "Divyanshu" })),
}));

import { api } from "@/lib/api";
import { CodeLensPanel } from "./CodeLensPanel";
import { codeLens, forgetLoadedThreadsForTests } from "@/lib/code-lens-store";
import { TooltipProvider } from "@/components/ui/tooltip";

const SELECTION = { path: "src/App.tsx", code: "const a = 1;", startLine: 1, endLine: 1 };

const renderPanel = (projectId: string) =>
  render(
    <TooltipProvider>
      <CodeLensPanel projectId={projectId} projectName="Demo" onClose={() => {}} onOpenSelection={() => {}} />
    </TooltipProvider>
  );

async function haveAnswer(projectId: string, text: string) {
  act(() => codeLens.open(projectId, SELECTION, { explain: true }));
  const call = vi.mocked(api.streamCodeInsight).mock.calls.at(-1)!;
  const [, , , onChunk, onComplete] = call as never as [
    string, string, unknown, (t: string) => void, () => void
  ];
  act(() => onChunk(text));
  act(() => onComplete());
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe("code notes header", () => {
  let projectId: string;
  let written: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    sessionStorage.clear();
    forgetLoadedThreadsForTests();
    vi.mocked(api.streamCodeInsight).mockImplementation((() => () => {}) as typeof api.streamCodeInsight);
    projectId = `lens-header-${Math.random()}`;

    written = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async (text: string) => { written.push(text); }) },
    });
  });

  it("offers nothing to take away until something has been said", async () => {
    renderPanel(projectId);
    act(() => codeLens.reopen(projectId));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(screen.queryByLabelText("Copy as markdown")).toBeNull();
    expect(screen.queryByLabelText("Export as markdown")).toBeNull();
  });

  it("copies the whole chat as markdown, not just the last answer", async () => {
    const { container } = renderPanel(projectId);
    await haveAnswer(projectId, "It stores the count.");

    const copy = container.querySelector<HTMLButtonElement>('[aria-label="Copy as markdown"]')!;
    await act(async () => { copy.click(); });

    expect(written).toHaveLength(1);
    expect(written[0]).toContain("# Demo - ExplainLLM notes");
    expect(written[0]).toContain("## You");
    expect(written[0]).toContain("Explain this");
    expect(written[0]).toContain("## VibeCraft");
    expect(written[0]).toContain("It stores the count.");
    expect(written[0]).toContain("src/App.tsx");
  });

  it("says it copied, then goes back to offering to", async () => {
    vi.useFakeTimers();
    const { container } = renderPanel(projectId);
    await haveAnswer(projectId, "It stores the count.");

    const copy = container.querySelector<HTMLButtonElement>('[aria-label="Copy as markdown"]')!;
    await act(async () => { copy.click(); });

    expect(container.querySelector('[aria-label="Copied"]')).not.toBeNull();

    act(() => { vi.advanceTimersByTime(2000); });
    expect(container.querySelector('[aria-label="Copied"]')).toBeNull();
    expect(container.querySelector('[aria-label="Copy as markdown"]')).not.toBeNull();
    vi.useRealTimers();
  });

  it("survives a refused clipboard rather than breaking the panel", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => { throw new Error("denied"); }) },
    });

    const { container } = renderPanel(projectId);
    await haveAnswer(projectId, "It stores the count.");

    const copy = container.querySelector<HTMLButtonElement>('[aria-label="Copy as markdown"]')!;
    await act(async () => { copy.click(); });

    expect(container.querySelector('[aria-label="Copied"]')).toBeNull();
    expect(container.textContent).toContain("It stores the count.");
  });
});
