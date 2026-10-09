/**
 * Covers what the ExplainLLM panel's header offers for taking a thread away.
 *
 * Handles: nothing being offered until something has been said, and the thread then being offered as a markdown file
 * and in no other way - copying it to the clipboard was removed at the owner's request on 2026-10-09, here and in the
 * project header. What the file contains is covered by lib/chat-export.test.ts.
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

  it("offers the notes as a file once there is an answer, and no copy button", async () => {
    renderPanel(projectId);
    await haveAnswer(projectId, "It stores the count.");

    expect(screen.queryByLabelText("Export as markdown")).not.toBeNull();
    expect(screen.queryByLabelText("Copy as markdown")).toBeNull();
  });
});
