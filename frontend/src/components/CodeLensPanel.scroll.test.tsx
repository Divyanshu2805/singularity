/**
 * Covers that the notes transcript follows an answer as it streams.
 *
 * jsdom has no layout, so the scroll container is given real numbers by hand: its height grows as the reply does, and
 * the scroll call records where it was sent.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";

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

let scrolledTo: number[] = [];
let scrollHeight = 0;

const lastChunkCallback = () => {
  const calls = vi.mocked(api.streamCodeInsight).mock.calls;
  return calls[calls.length - 1][3] as (text: string) => void;
};

function trackScrolling(container: HTMLElement) {
  const el = container.querySelector<HTMLElement>(".overflow-y-auto")!;
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => scrollHeight });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: 400 });
  el.scrollTo = ((options: ScrollToOptions) => {
    scrolledTo.push(options.top ?? 0);
    Object.defineProperty(el, "scrollTop", { configurable: true, value: (options.top ?? 0) - 400 });
  }) as HTMLElement["scrollTo"];
  return el;
}

describe("code notes following a streaming answer", () => {
  let projectId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    forgetLoadedThreadsForTests();
    scrolledTo = [];
    scrollHeight = 500;
    projectId = `lens-scroll-${Math.random()}`;
  });

  const startAnswer = async (container: HTMLElement) => {
    act(() => codeLens.open(projectId, SELECTION, { explain: true }));
    await act(async () => { await Promise.resolve(); });
    const el = trackScrolling(container);
    scrolledTo = [];
    return { el, chunk: lastChunkCallback() };
  };

  it("scrolls down as each chunk arrives, not only when the turn ends", async () => {
    const { container } = renderPanel(projectId);
    const { chunk } = await startAnswer(container);

    act(() => {
      scrollHeight = 900;
      chunk("It renders ");
    });
    act(() => {
      scrollHeight = 1400;
      chunk("the main screen.");
    });

    expect(scrolledTo).toEqual([900, 1400]);
  });

  it("stops following once the reader scrolls up, and resumes at the bottom", async () => {
    const { container } = renderPanel(projectId);
    const { el, chunk } = await startAnswer(container);

    Object.defineProperty(el, "scrollTop", { configurable: true, value: 0 });
    act(() => el.dispatchEvent(new Event("scroll", { bubbles: true })));

    scrolledTo = [];
    act(() => {
      scrollHeight = 2000;
      chunk("more text");
    });
    expect(scrolledTo).toEqual([]);

    Object.defineProperty(el, "scrollTop", { configurable: true, value: 1600 });
    act(() => el.dispatchEvent(new Event("scroll", { bubbles: true })));
    act(() => {
      scrollHeight = 2400;
      chunk(" and more");
    });
    expect(scrolledTo).toEqual([2400]);
  });
});
