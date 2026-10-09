/**
 * Covers the learning panel: the tour is asked for only by a press and kept; a tour that exists is read back and
 * rewritten only on request; a path in it opens the file; a marked word in it opens the glossary; and the glossary
 * lists the words, defines a looked-up or pressed word once, and removes one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LearnPanel } from "./LearnPanel";
import { api } from "@/lib/api";
import { learnPanel } from "@/lib/learn-panel-store";
import { forget, termStateKey, tourKey } from "@/lib/lesson-store";

vi.mock("@/lib/api", () => ({
  api: {
    streamCodeInsight: vi.fn(),
    getProjectTour: vi.fn(),
    getGlossary: vi.fn(),
    deleteGlossaryEntry: vi.fn(),
  },
  getUserInfo: () => null,
}));

const TOUR = [
  "This app keeps notes.",
  "",
  "### The files",
  "- `src/pages/Index.tsx` - The screen.",
  "",
  "### How a click travels",
  "1. You type in `src/pages/Index.tsx`.",
  "2. The **state** changes.",
].join("\n");

const streams: { kind: string; body: Record<string, unknown>; chunk: (text: string) => void; done: () => void; fail: (error: Error) => void }[] = [];
let project = 0;
const id = () => `learn${project}`;

function renderPanel(props: Partial<Parameters<typeof LearnPanel>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LearnPanel projectId={id()} onOpenFile={vi.fn()} onAsk={vi.fn()} {...props} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  project += 1;
  streams.length = 0;
  vi.mocked(api.streamCodeInsight).mockReset().mockImplementation((_project, kind, body, chunk, done, fail) => {
    streams.push({ kind, body, chunk, done, fail: fail as (error: Error) => void });
    return () => undefined;
  });
  vi.mocked(api.getProjectTour).mockReset().mockResolvedValue(null);
  vi.mocked(api.getGlossary).mockReset().mockResolvedValue([]);
  vi.mocked(api.deleteGlossaryEntry).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => learnPanel.close());
  forget(tourKey(id()));
});

describe("the tour", () => {
  it("is closed until it is opened, and writes nothing until the button is pressed", async () => {
    renderPanel();
    expect(screen.queryByText("Learn your project")).not.toBeInTheDocument();

    act(() => learnPanel.open(id()));
    expect(await screen.findByRole("button", { name: /write the tour/i })).toBeInTheDocument();
    expect(streams).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /write the tour/i }));
    expect(streams[0]).toMatchObject({ kind: "tour", body: { rewrite: false, level: "NEW" } });

    act(() => { streams[0].chunk(TOUR); streams[0].done(); });
    expect(screen.getByText("This app keeps notes.")).toBeInTheDocument();
    expect(screen.getByText("The files")).toBeInTheDocument();
    expect(screen.getByText("How a click travels")).toBeInTheDocument();
  });

  it("reads back the tour that was kept without asking for it again, and writes it again only on request", async () => {
    vi.mocked(api.getProjectTour).mockResolvedValue({ content: TOUR, writtenAt: new Date().toISOString() });
    renderPanel();
    act(() => learnPanel.open(id()));

    expect(await screen.findByText("This app keeps notes.")).toBeInTheDocument();
    expect(streams).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /write it again/i }));
    expect(streams[0]).toMatchObject({ kind: "tour", body: { rewrite: true } });
  });

  it("opens a file it names in the editor and closes, and opens a marked word in the glossary", async () => {
    vi.mocked(api.getProjectTour).mockResolvedValue({ content: TOUR });
    const onOpenFile = vi.fn();
    renderPanel({ onOpenFile });
    act(() => learnPanel.open(id()));
    await screen.findByText("This app keeps notes.");

    fireEvent.click(within(screen.getByText("The files").closest("section")!).getByTitle("Open src/pages/Index.tsx"));
    expect(onOpenFile).toHaveBeenCalledWith("src/pages/Index.tsx");
    expect(learnPanel.state().projectId).toBeNull();

    act(() => learnPanel.open(id()));
    fireEvent.click(await screen.findByRole("button", { name: "state" }));
    expect(learnPanel.state()).toMatchObject({ tab: "glossary", term: "state" });
    expect(streams[0]).toMatchObject({ kind: "glossary", body: { term: "state" } });
    forget(termStateKey(id(), "state"));
  });

  it("says so when writing fails and offers to try again", async () => {
    renderPanel();
    act(() => learnPanel.open(id()));
    fireEvent.click(await screen.findByRole("button", { name: /write the tour/i }));
    act(() => streams[0].fail(new Error("You've used today's allowance.")));

    expect(screen.getByText("You've used today's allowance.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(streams).toHaveLength(2);
  });
});

describe("the glossary", () => {
  const entries = [
    { id: 1, term: "Props", definition: "Inputs a component is given." },
    { id: 2, term: "State", definition: "What a page remembers." },
  ];

  it("lists the words and reads one back without asking for it again", async () => {
    vi.mocked(api.getGlossary).mockResolvedValue(entries);
    renderPanel();
    act(() => learnPanel.open(id(), "glossary"));

    fireEvent.click(await screen.findByRole("button", { name: "State" }));

    expect(screen.getByText("What a page remembers.")).toBeInTheDocument();
    expect(streams).toHaveLength(0);
  });

  it("defines a looked-up word and refreshes the list when it is written", async () => {
    renderPanel();
    act(() => learnPanel.open(id(), "glossary"));

    fireEvent.change(await screen.findByLabelText("Look up a word"), { target: { value: "  **Hooks** " } });
    fireEvent.click(screen.getByRole("button", { name: /define/i }));

    expect(streams[0]).toMatchObject({ kind: "glossary", body: { term: "Hooks", level: "NEW" } });
    expect(learnPanel.state()).toMatchObject({ tab: "glossary", term: "Hooks" });
    expect(screen.getByText(/looking for it in your project/i)).toBeInTheDocument();

    vi.mocked(api.getGlossary).mockResolvedValue([{ id: 3, term: "Hooks", definition: "Functions that plug in." }]);
    await act(async () => { streams[0].chunk("Functions that plug in.\n\n### Think of it like\nA socket."); streams[0].done(); });

    expect(screen.getAllByText("Functions that plug in.").length).toBeGreaterThan(0);
    await waitFor(() => expect(api.getGlossary).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: "Hooks" })).toBeInTheDocument();
    forget(termStateKey(id(), "Hooks"));
  });

  it("hands a word to ExplainLLM and closes, and removes a word from the glossary", async () => {
    vi.mocked(api.getGlossary).mockResolvedValue(entries);
    const onAsk = vi.fn();
    renderPanel({ onAsk });
    act(() => learnPanel.open(id(), "glossary"));
    fireEvent.click(await screen.findByRole("button", { name: "Props" }));

    fireEvent.click(screen.getByRole("button", { name: /remove props from your glossary/i }));
    await waitFor(() => expect(api.deleteGlossaryEntry).toHaveBeenCalledWith(id(), 1));
    expect(learnPanel.state().term).toBeNull();
    await waitFor(() => expect(api.getGlossary).toHaveBeenCalledTimes(2));

    fireEvent.click(await screen.findByRole("button", { name: "State" }));
    fireEvent.click(screen.getByRole("button", { name: /ask explainllm more/i }));
    expect(onAsk).toHaveBeenCalledWith({ question: expect.stringContaining('What does "State" mean?') });
    expect(learnPanel.state().projectId).toBeNull();
  });

  it("says when there are no words yet", async () => {
    renderPanel();
    act(() => learnPanel.open(id(), "glossary"));

    expect(await screen.findByText(/no words yet/i)).toBeInTheDocument();
  });
});
