/**
 * Covers the rendered form of a build turn: the one card for its steps and files, the thought process above it - shown a
 * step at a time and folded unless it is opened - and teaching mode, which writes nothing during the build and puts,
 * beside each finished step of a turn that was built with it, an icon that opens the lesson on what the step changed:
 * the one the conversation already carries, or one asked for by the saved step's id.
 *
 * It also covers lessons saved by earlier versions, the what and why and the older line-by-line shape: they sit folded
 * under their step, and their quoted lines still open the file at the line they quote.
 */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { AssistantEvents } from "./ChatEventRenderer";
import { api } from "@/lib/api";
import { learnPanel } from "@/lib/learn-panel-store";
import { ChatEvent, ChatEventType } from "@/lib/types";

vi.mock("@/lib/api", () => ({ api: { streamCodeInsight: vi.fn() }, getUserInfo: () => null }));

const LIKE_BUTTON = [
  "export function LikeButton() {",
  "  const [likes, setLikes] = useState(0);",
  "  return <button onClick={() => setLikes(likes + 1)}>{likes}</button>;",
  "}",
].join("\n");

const lesson = (what: string, why: string) => `<what>${what}</what><why>${why}</why>`;

const EVENTS: ChatEvent[] = [
  { type: ChatEventType.THINKING, content: "One button, one page.\nThe count lives in the button." },
  { type: ChatEventType.MESSAGE, content: "Starting with the button itself." },
  { type: ChatEventType.TODO, content: "Building the like button", filePath: "src/LikeButton.tsx" },
  { type: ChatEventType.TODO, content: "Showing it on the page", filePath: "src/App.tsx" },
  {
    type: ChatEventType.LEARN,
    filePath: "src/LikeButton.tsx",
    metadata: "State",
    content: lesson("Adds the heart button under each post.", "A post needs somewhere to keep its count."),
  },
  { type: ChatEventType.FILE_EDIT, filePath: "src/LikeButton.tsx", content: LIKE_BUTTON },
  {
    type: ChatEventType.LEARN,
    filePath: "src/App.tsx",
    content: lesson("Puts the button on the screen.", "Now that `LikeButton` exists, the page can show it."),
  },
  { type: ChatEventType.FILE_EDIT, filePath: "src/App.tsx", content: "export default App;" },
];

const openBuildCard = () =>
  screen.queryAllByRole("button", { expanded: false })
    .filter((button) => /^(Built|Build steps|Edited|Changed)/.test(button.textContent ?? ""))
    .forEach((button) => fireEvent.click(button));

const opened = <T,>(rendered: T): T => {
  openBuildCard();
  return rendered;
};

const renderTurn = (props: Partial<Parameters<typeof AssistantEvents>[0]> = {}) =>
  opened(render(<AssistantEvents events={EVENTS} isStreaming={false} isIdle={false} {...props} />));

const stepRow = (label: string) => screen.getByText(label).closest("li")!;

describe("a build in the chat", () => {
  it("is one card: each step with the file it wrote beside it, and no second list of files", () => {
    renderTurn();

    expect(screen.getByText("Build steps")).toBeInTheDocument();
    expect(screen.getByLabelText("2 of 2 steps done")).toBeInTheDocument();
    expect(within(stepRow("Building the like button")).getByText("LikeButton.tsx")).toBeInTheDocument();
    expect(within(stepRow("Showing it on the page")).getByText("App.tsx")).toBeInTheDocument();
    expect(screen.queryByText(/Edited \d+ files/)).not.toBeInTheDocument();
    expect(screen.getAllByText("LikeButton.tsx")).toHaveLength(1);
  });

  it("opens a step's file from its chip", () => {
    const onOpenFile = vi.fn();
    renderTurn({ onOpenFile });

    fireEvent.click(screen.getByTitle(/open src\/LikeButton\.tsx/i));

    expect(onOpenFile).toHaveBeenCalledWith("src/LikeButton.tsx");
  });

  it("draws no plan while it is being written: one line names the file being written, and opens to the files", () => {
    const plan = EVENTS.slice(2, 4);
    const { unmount } = render(<AssistantEvents events={plan} isStreaming isIdle={false} />);
    expect(screen.queryByText("Plan")).not.toBeInTheDocument();
    expect(screen.queryByText("LikeButton.tsx")).not.toBeInTheDocument();
    unmount();

    const first = render(<AssistantEvents events={[...plan, { type: ChatEventType.FILE_EDIT, filePath: "src/LikeButton.tsx", content: "x", isComplete: false }]} isStreaming isIdle={false} />);
    expect(screen.queryByText("Building")).not.toBeInTheDocument();
    expect(screen.queryByText("Building the like button")).not.toBeInTheDocument();
    expect(screen.queryByText("1/2")).not.toBeInTheDocument();
    const line = screen.getByRole("button", { name: /writing likebutton\.tsx/i });
    expect(line).toHaveAttribute("aria-expanded", "false");
    first.unmount();

    render(
      <AssistantEvents
        events={[
          ...plan,
          { type: ChatEventType.FILE_EDIT, filePath: "src/LikeButton.tsx", content: "x" },
          { type: ChatEventType.FILE_PATCH, filePath: "src/App.tsx", content: "y", isComplete: false },
        ]}
        isStreaming
        isIdle={false}
      />
    );
    const second = screen.getByRole("button", { name: /editing app\.tsx.*2 files/i });
    expect(screen.queryByText("LikeButton.tsx")).not.toBeInTheDocument();
    fireEvent.click(second);
    expect(screen.getByText("LikeButton.tsx")).toBeInTheDocument();
  });

  it("folds a saved turn's files to one line that opens to the files, like the thought process", () => {
    renderTurn();

    const fold = screen.getByRole("button", { name: /files? written/i });
    expect(fold).toHaveAttribute("aria-expanded", "false");
    const before = screen.getAllByText("LikeButton.tsx").length;

    fireEvent.click(fold);

    expect(fold).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("LikeButton.tsx").length).toBe(before + 1);

    fireEvent.click(fold);
    expect(screen.getAllByText("LikeButton.tsx").length).toBe(before);
  });

  it("puts the build card last once the turn is saved, under the closing words", () => {
    renderTurn();

    const card = screen.getByText("Build steps");
    const closing = screen.getAllByText(/./).filter((node) => node.tagName === "P").at(-1)!;
    expect(closing.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("the thought process", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const THOUGHT = "One button, one page.\nThe count lives in the button.\nNo router is needed.";

  it("is folded away on a finished turn and opens, as numbered steps, when asked", () => {
    renderTurn();

    const toggle = screen.getByRole("button", { name: /thought process/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/The count lives in the button/)).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByText(/The count lives in the button/)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2 + 2);
  });

  it("shows one step at a time as it works, never typing, and never opens or closes by itself", () => {
    const thinking: ChatEvent = { type: ChatEventType.THINKING, content: THOUGHT, isComplete: true };
    render(<AssistantEvents events={[thinking, EVENTS[1]]} isStreaming isIdle={false} />);

    const toggle = screen.getByRole("button", { name: /thinking/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("One button, one page.");
    expect(toggle).not.toHaveTextContent("The count lives");

    act(() => { vi.advanceTimersByTime(800); });
    expect(toggle).toHaveTextContent("The count lives in the button.");

    act(() => { vi.advanceTimersByTime(800); });
    expect(toggle).toHaveTextContent("No router is needed.");

    act(() => { vi.advanceTimersByTime(300); });
    expect(toggle).toHaveTextContent("No router is needed.");

    act(() => { vi.advanceTimersByTime(600); });
    const settled = screen.getByRole("button", { name: /thought process/i });
    expect(settled).toHaveAttribute("aria-expanded", "false");
    expect(settled).toHaveTextContent("3 steps");
  });

  it("holds back a step that is still being written", () => {
    const arriving: ChatEvent = { type: ChatEventType.THINKING, content: "One button, one page.\nThe count li", isComplete: false };
    render(<AssistantEvents events={[arriving]} isStreaming isIdle={false} />);

    const toggle = screen.getByRole("button", { name: /thinking/i });
    expect(toggle).toHaveTextContent("One button, one page.");
    act(() => { vi.advanceTimersByTime(2000); });
    expect(toggle).not.toHaveTextContent("The count li");
  });
});

describe("lessons written by earlier versions", () => {
  it("sit folded under their steps, and open in the order the build happened", () => {
    renderTurn();

    const first = within(stepRow("Building the like button"));
    expect(first.queryByText("Adds the heart button under each post.")).not.toBeInTheDocument();
    expect(first.getByRole("button", { name: /what this step does/i })).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(first.getByRole("button", { name: /what this step does/i }));
    fireEvent.click(within(stepRow("Showing it on the page")).getByRole("button", { name: /what this step does/i }));

    expect(first.getByText("Adds the heart button under each post.")).toBeInTheDocument();
    expect(first.getByText("A post needs somewhere to keep its count.")).toBeInTheDocument();
    expect(first.getByText("State")).toBeInTheDocument();
    const second = within(stepRow("Showing it on the page"));
    expect(second.getByText("Puts the button on the screen.")).toBeInTheDocument();
    expect(second.getByText("LikeButton")).toBeInTheDocument();
  });

  it("hand a step to the code lens when its detail is asked for", () => {
    const onExplainStep = vi.fn();
    renderTurn({ onExplainStep });

    const row = within(stepRow("Building the like button"));
    fireEvent.click(row.getByRole("button", { name: /what this step does/i }));
    fireEvent.click(row.getByRole("button", { name: /explain in detail/i }));

    expect(onExplainStep).toHaveBeenCalledWith({
      path: "src/LikeButton.tsx",
      label: "Building the like button",
      what: "Adds the heart button under each post.",
    });
  });

  it("offer no detail while the turn is still being written, or when nothing can take the question", () => {
    const { unmount } = renderTurn({ onExplainStep: vi.fn(), isStreaming: true });
    expect(screen.queryByRole("button", { name: /what this step does/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /explain in detail/i })).not.toBeInTheDocument();
    unmount();

    renderTurn();
    fireEvent.click(within(stepRow("Building the like button")).getByRole("button", { name: /what this step does/i }));
    expect(screen.queryByRole("button", { name: /explain in detail/i })).not.toBeInTheDocument();
  });
});

describe("teaching mode's lesson on a step", () => {
  const BUILT: ChatEvent[] = [
    { type: ChatEventType.TODO, content: "Building the like button", filePath: "src/LikeButton.tsx" },
    { id: 11, type: ChatEventType.FILE_EDIT, filePath: "src/LikeButton.tsx", content: LIKE_BUTTON },
  ];
  const streams: { body: Record<string, unknown>; chunk: (text: string) => void; done: () => void; fail: (error: Error) => void }[] = [];
  let project = 0;

  beforeEach(() => {
    streams.length = 0;
    project += 1;
    vi.mocked(api.streamCodeInsight).mockReset();
    vi.mocked(api.streamCodeInsight).mockImplementation((_project, _kind, body, chunk, done, fail) => {
      streams.push({ body, chunk, done, fail: fail as (error: Error) => void });
      return () => undefined;
    });
  });

  const renderBuilt = (props: Partial<Parameters<typeof AssistantEvents>[0]> = {}) =>
    opened(render(<AssistantEvents events={BUILT} isStreaming={false} isIdle={false} teaching projectId={`p${project}`} {...props} />));

  const hat = () => screen.getByRole("button", { name: /what this step changed in likebutton\.tsx/i });

  it("is an icon in the step's own row, closed, and asks for nothing until it is pressed - pointing at it included", () => {
    renderBuilt();

    expect(hat()).toHaveAttribute("aria-expanded", "false");
    expect(hat().parentElement).toBe(screen.getByText("Building the like button").parentElement);
    expect(screen.queryByText(/how likebutton\.tsx works/i)).not.toBeInTheDocument();

    fireEvent.pointerEnter(hat());
    fireEvent.focus(hat());
    expect(api.streamCodeInsight).not.toHaveBeenCalled();
  });

  it("is offered only on a turn built in teaching mode, once it is saved, and never for a deleted file", () => {
    const { unmount } = renderBuilt({ teaching: false });
    expect(screen.queryByRole("button", { name: /what this step changed/i })).not.toBeInTheDocument();
    unmount();

    const streaming = renderBuilt({ isStreaming: true });
    expect(screen.queryByRole("button", { name: /what this step changed/i })).not.toBeInTheDocument();
    streaming.unmount();

    const unsaved = renderBuilt({ events: [BUILT[0], { ...BUILT[1], id: undefined }] });
    expect(screen.queryByRole("button", { name: /what this step changed/i })).not.toBeInTheDocument();
    unsaved.unmount();

    renderBuilt({ events: [BUILT[0], { id: 12, type: ChatEventType.FILE_DELETE, filePath: "src/LikeButton.tsx", content: "" }] });
    expect(screen.queryByRole("button", { name: /what this step changed/i })).not.toBeInTheDocument();
  });

  it("asks for the saved step by its id when pressed, and shows the answer under the step as it streams in", () => {
    renderBuilt();

    fireEvent.click(hat());

    expect(streams).toHaveLength(1);
    expect(streams[0].body).toEqual({ eventId: 11, level: "NEW" });
    expect(hat()).toHaveAttribute("aria-expanded", "true");
    expect(within(stepRow("Building the like button")).getByText(/looking at what changed in likebutton\.tsx/i)).toBeInTheDocument();

    act(() => streams[0].chunk("You asked for a button that counts.\n\n### L2 · Keeping the count\nThe **state** lives here"));
    expect(screen.getByText("You asked for a button that counts.")).toBeInTheDocument();
    expect(screen.getByText("Keeping the count")).toBeInTheDocument();
    expect(screen.getByText("const [likes, setLikes] = useState(0);")).toBeInTheDocument();
    expect(screen.getByText(/still writing/i)).toBeInTheDocument();

    act(() => { streams[0].chunk(" for the button.\n\n### What happens next\nThe page shows it.\n"); streams[0].done(); });
    expect(screen.getByText("state")).toBeInTheDocument();
    expect(screen.getByText("What happens next")).toBeInTheDocument();
    expect(screen.queryByText(/still writing/i)).not.toBeInTheDocument();
  });

  it("is asked for once however often it is closed and opened again", () => {
    renderBuilt();

    fireEvent.click(hat());
    fireEvent.click(hat());
    expect(screen.queryByText(/looking at what changed/i)).not.toBeInTheDocument();
    fireEvent.click(hat());

    expect(streams).toHaveLength(1);
  });

  it("shows a lesson the conversation already carries without asking for it again", () => {
    renderBuilt({ events: [BUILT[0], { ...BUILT[1], lesson: "You asked for a counter.\n\n### L2 · The count\nIt is kept here.\n" }] });

    fireEvent.click(hat());

    expect(screen.getByText("You asked for a counter.")).toBeInTheDocument();
    expect(screen.getByText("The count")).toBeInTheDocument();
    expect(api.streamCodeInsight).not.toHaveBeenCalled();
  });

  it("puts an icon beside each file when a step wrote more than one, and names the file whose lesson is open", () => {
    renderBuilt({
      events: [
        BUILT[0],
        BUILT[1],
        { id: 13, type: ChatEventType.FILE_EDIT, filePath: "src/useLikes.ts", content: "export const useLikes = () => 0;" },
        { type: ChatEventType.TODO, content: "Showing it on the page", filePath: "src/App.tsx" },
      ],
      isStreaming: false,
    });

    fireEvent.click(screen.getByRole("button", { name: /what this step changed in uselikes\.ts/i }));

    expect(streams[0].body).toEqual({ eventId: 13, level: "NEW" });
    expect(hat()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(/looking at what changed in uselikes\.ts/i)).toBeInTheDocument();
  });

  it("points at the lines it is about: a range button opens the file with those lines marked", () => {
    const onOpenFile = vi.fn();
    renderBuilt({ onOpenFile });
    fireEvent.click(hat());

    act(() => { streams[0].chunk("Overview.\n\n### L2-3 · The button\nIt counts.\n"); streams[0].done(); });
    fireEvent.click(screen.getByRole("button", { name: /^L2–3/ }));

    expect(onOpenFile).toHaveBeenCalledWith("src/LikeButton.tsx", { line: 2, endLine: 3 });
  });

  it("says so when the answer fails, and asks again on request", () => {
    renderBuilt();
    fireEvent.click(hat());

    act(() => streams[0].fail(new Error("The AI is busy right now.")));
    expect(screen.getByText("The AI is busy right now.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(streams).toHaveLength(2);
  });
});

describe("a walkthrough saved before lessons became a what and a why", () => {
  const OLD: ChatEvent[] = [
    { type: ChatEventType.TODO, content: "Building the like button", filePath: "src/LikeButton.tsx" },
    { type: ChatEventType.FILE_EDIT, filePath: "src/LikeButton.tsx", content: LIKE_BUTTON },
    {
      type: ChatEventType.LEARN,
      filePath: "src/LikeButton.tsx",
      content:
        '<summary>The heart button under each post.</summary>' +
        '<part concept="State"><code>const [likes, setLikes] = useState(0);</code>Keeps the count in memory.</part>',
    },
  ];

  it("shows its summary in place and keeps its quoted lines behind a toggle", () => {
    opened(render(<AssistantEvents events={OLD} isStreaming={false} isIdle={false} />));

    fireEvent.click(screen.getByRole("button", { name: /what this step does/i }));
    expect(screen.getByText("The heart button under each post.")).toBeInTheDocument();
    expect(screen.queryByText("Keeps the count in memory.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /line by line/i }));

    expect(screen.getByText("Keeps the count in memory.")).toBeInTheDocument();
  });

  it("jumps to the quoted line when its reference is clicked", () => {
    const onOpenFile = vi.fn();
    opened(render(<AssistantEvents events={OLD} isStreaming={false} isIdle={false} onOpenFile={onOpenFile} />));

    fireEvent.click(screen.getByRole("button", { name: /what this step does/i }));
    fireEvent.click(screen.getByRole("button", { name: /line by line/i }));
    fireEvent.click(screen.getByTitle(/show line 2 of src\/LikeButton\.tsx/i));

    expect(onOpenFile).toHaveBeenCalledWith("src/LikeButton.tsx", { line: 2, code: "const [likes, setLikes] = useState(0);" });
  });
});

describe("teaching mode from the whole to the part to the detail", () => {
  const TWO_STEPS: ChatEvent[] = [
    { type: ChatEventType.TODO, content: "Building the like button", filePath: "src/LikeButton.tsx" },
    { id: 11, type: ChatEventType.FILE_EDIT, filePath: "src/LikeButton.tsx", content: LIKE_BUTTON },
    { type: ChatEventType.TODO, content: "Showing it on the page", filePath: "src/App.tsx" },
    { id: 12, type: ChatEventType.FILE_EDIT, filePath: "src/App.tsx", content: "export default App;" },
  ];
  const PICTURE = "You asked for a like button.\n\n### The pieces\n- `src/LikeButton.tsx` - The button itself.\n\n### Ideas in this build\n- **State** - what the button remembers.\n";
  const LESSON = "You asked for a button.\n\n### L2-3 · Keeping the count\nThe **state** lives here.\n\n### What happens next\nThe page shows it.\n\n### Check yourself\nWhich line keeps the count?\n";
  const streams: { kind: string; body: Record<string, unknown>; chunk: (text: string) => void; done: () => void; fail: (error: Error) => void }[] = [];
  let project = 100;

  beforeEach(() => {
    streams.length = 0;
    project += 1;
    learnPanel.close();
    Element.prototype.scrollIntoView = vi.fn();
    vi.mocked(api.streamCodeInsight).mockReset();
    vi.mocked(api.streamCodeInsight).mockImplementation((_project, kind, body, chunk, done, fail) => {
      streams.push({ kind, body, chunk, done, fail: fail as (error: Error) => void });
      return () => undefined;
    });
  });

  const renderTaught = (props: Partial<Parameters<typeof AssistantEvents>[0]> = {}) =>
    opened(render(<AssistantEvents events={TWO_STEPS} isStreaming={false} isIdle={false} teaching projectId={`p${project}`} turnId={5} {...props} />));

  const bigPicture = () => screen.getByRole("button", { name: /the big picture/i });
  const hatFor = (file: RegExp) => screen.getByRole("button", { name: file });

  it("is a folded row that asks for nothing until it is pressed, even on a turn that has just finished", () => {
    renderTaught();

    expect(bigPicture()).toHaveAttribute("aria-expanded", "false");
    expect(api.streamCodeInsight).not.toHaveBeenCalled();

    fireEvent.click(bigPicture());
    expect(streams).toHaveLength(1);
    expect(streams[0]).toMatchObject({ kind: "overview", body: { messageId: 5, level: "NEW" } });
    expect(bigPicture()).toHaveAttribute("aria-expanded", "true");

    act(() => { streams[0].chunk(PICTURE); streams[0].done(); });
    expect(screen.getByText("You asked for a like button.")).toBeInTheDocument();
    expect(screen.getByText("The pieces")).toBeInTheDocument();
    expect(screen.getByText("Ideas in this build")).toBeInTheDocument();
  });

  it("is a card of its own above the build card, with no button into the lessons", () => {
    render(<AssistantEvents events={TWO_STEPS} isStreaming={false} isIdle={false} teaching projectId={`p${project}`} turnId={5} overview={PICTURE} />);
    const built = screen.getByRole("button", { name: /^build steps/i });

    expect(built).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Building the like button")).not.toBeInTheDocument();
    expect(built.closest(".chat-tile")).not.toBe(bigPicture().closest(".chat-tile"));
    expect(bigPicture().compareDocumentPosition(built) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(bigPicture());
    expect(screen.getByText("You asked for a like button.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start with step/i })).not.toBeInTheDocument();
    expect(built).toHaveAttribute("aria-expanded", "false");
  });

  it("shows one step's lesson at a time, and lights the step that is open", () => {
    renderTaught();

    fireEvent.click(hatFor(/what this step changed in likebutton\.tsx/i));
    expect(stepRow("Building the like button")).toHaveAttribute("data-open", "true");

    fireEvent.click(hatFor(/what this step changed in app\.tsx/i));
    expect(hatFor(/what this step changed in likebutton\.tsx/i)).toHaveAttribute("aria-expanded", "false");
    expect(stepRow("Building the like button")).not.toHaveAttribute("data-open");
    expect(stepRow("Showing it on the page")).toHaveAttribute("data-open", "true");
    expect(screen.getAllByText(/looking at what changed/i)).toHaveLength(1);
  });

  it("shows a big picture the conversation already carries without asking, and offers none without a saved turn or teaching", () => {
    const saved = renderTaught({ overview: PICTURE });
    fireEvent.click(bigPicture());
    expect(screen.getByText("You asked for a like button.")).toBeInTheDocument();
    expect(api.streamCodeInsight).not.toHaveBeenCalled();
    saved.unmount();

    const unsaved = renderTaught({ turnId: undefined });
    expect(screen.queryByRole("button", { name: /the big picture/i })).not.toBeInTheDocument();
    unsaved.unmount();

    renderTaught({ teaching: false });
    expect(screen.queryByRole("button", { name: /the big picture/i })).not.toBeInTheDocument();
    expect(api.streamCodeInsight).not.toHaveBeenCalled();
  });

  it("says so when it fails, and asks again on request", () => {
    renderTaught();
    fireEvent.click(bigPicture());
    act(() => streams[0].fail(new Error("You've used today's allowance.")));
    expect(screen.getByText("You've used today's allowance.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(streams).toHaveLength(2);
  });

  it("opens a file it names, and opens a marked idea in the glossary", () => {
    const onOpenFile = vi.fn();
    const onAskAbout = vi.fn();
    renderTaught({ overview: PICTURE, onOpenFile, onAskAbout });
    fireEvent.click(bigPicture());

    fireEvent.click(within(screen.getByText("The pieces").closest("section")!).getByTitle("Open src/LikeButton.tsx"));
    expect(onOpenFile).toHaveBeenCalledWith("src/LikeButton.tsx");

    fireEvent.click(screen.getByRole("button", { name: "State" }));
    expect(onAskAbout).not.toHaveBeenCalled();
    expect(learnPanel.state()).toEqual({ projectId: `p${project}`, tab: "glossary", term: "State" });
    expect(streams).toHaveLength(1);
    expect(streams[0]).toMatchObject({ kind: "glossary", body: { term: "State", level: "NEW" } });
  });

  it("opens a marked word in a lesson in the glossary too, asking for nothing until it is pressed", () => {
    renderTaught();
    fireEvent.click(hatFor(/what this step changed in likebutton\.tsx/i));
    act(() => { streams[0].chunk(LESSON); streams[0].done(); });
    expect(streams).toHaveLength(1);
    expect(learnPanel.state().projectId).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "state" }));

    expect(streams[1]).toMatchObject({ kind: "glossary", body: { term: "state", level: "NEW" } });
    expect(learnPanel.state()).toMatchObject({ tab: "glossary", term: "state" });
  });

  describe("try changing this", () => {
    const TASK = "Change the count's starting number to 5.\n\n### L2 · Where to look\nThe line that sets the first count.\n\n### Done when\nThe starting number is no longer 0.\n";
    const lessonDone = (props: Partial<Parameters<typeof AssistantEvents>[0]> = {}) => {
      const onOpenFile = vi.fn();
      renderTaught({ onOpenFile, ...props });
      fireEvent.click(hatFor(/what this step changed in likebutton\.tsx/i));
      act(() => { streams[0].chunk(LESSON); streams[0].done(); });
      return onOpenFile;
    };

    it("is a card after the lesson that asks for nothing until a task is asked for", () => {
      lessonDone();

      expect(screen.getByText("Try changing this")).toBeInTheDocument();
      expect(streams).toHaveLength(1);

      fireEvent.click(screen.getByRole("button", { name: /give me a task/i }));
      expect(streams[1]).toMatchObject({ kind: "task", body: { eventId: 11, level: "NEW" } });
      expect(screen.getByText(/thinking of a small task/i)).toBeInTheDocument();

      act(() => { streams[1].chunk(TASK); streams[1].done(); });
      expect(screen.getByText("Change the count's starting number to 5.")).toBeInTheDocument();
      expect(screen.getByText("The line that sets the first count.")).toBeInTheDocument();
      expect(screen.getByText(/the starting number is no longer 0/i)).toBeInTheDocument();
    });

    it("opens the file at the line it points at, and is not offered where there is nowhere to open it", () => {
      const onOpenFile = lessonDone();
      fireEvent.click(screen.getByRole("button", { name: /give me a task/i }));
      act(() => { streams[1].chunk(TASK); streams[1].done(); });

      fireEvent.click(screen.getByRole("button", { name: "L2" }));
      expect(onOpenFile).toHaveBeenCalledWith("src/LikeButton.tsx", { line: 2, endLine: 2 });
    });

    it("checks the saved file when asked, says Not yet with a hint, and checks again on request", () => {
      lessonDone();
      fireEvent.click(screen.getByRole("button", { name: /give me a task/i }));
      act(() => { streams[1].chunk(TASK); streams[1].done(); });

      fireEvent.click(screen.getByRole("button", { name: /check my change/i }));
      expect(streams[2]).toMatchObject({ kind: "task-check", body: { eventId: 11, level: "NEW" } });
      expect(screen.getByText(/reading likebutton\.tsx/i)).toBeInTheDocument();

      act(() => { streams[2].chunk("Not yet\n\nLine 2 still says 0."); streams[2].done(); });
      expect(screen.getByText("Not yet.")).toBeInTheDocument();
      expect(screen.getByText(/line 2 still says 0/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /check my change/i }));
      expect(streams).toHaveLength(4);
      act(() => { streams[3].chunk("Done\n\nThe count now starts at 5."); streams[3].done(); });
      expect(screen.getByText("Done.")).toBeInTheDocument();
      expect(screen.getByText(/the count now starts at 5/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /check my change/i })).not.toBeInTheDocument();
    });

    it("shows a task and its result the conversation already carries, without asking", () => {
      const withTask = TWO_STEPS.map((event) => event.id === 11 ? { ...event, task: TASK, taskDone: true } : event);
      renderTaught({ events: withTask, onOpenFile: vi.fn() });
      fireEvent.click(hatFor(/what this step changed in likebutton\.tsx/i));
      act(() => { streams[0].chunk(LESSON); streams[0].done(); });

      expect(screen.getByText("Change the count's starting number to 5.")).toBeInTheDocument();
      expect(screen.getByText("Done.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /give me a task|check my change/i })).not.toBeInTheDocument();
      expect(streams).toHaveLength(1);
    });

    it("is not drawn when nothing can open the file", () => {
      renderTaught();
      fireEvent.click(hatFor(/what this step changed in likebutton\.tsx/i));
      act(() => { streams[0].chunk(LESSON); streams[0].done(); });

      expect(screen.queryByText("Try changing this")).not.toBeInTheDocument();
    });
  });

  it("offers ExplainLLM's three questions under a section, with that section's lines as the selection", () => {
    const onAskAbout = vi.fn();
    renderTaught({ onAskAbout });
    fireEvent.click(hatFor(/what this step changed in likebutton\.tsx/i));
    act(() => { streams[0].chunk(LESSON); streams[0].done(); });

    const questions = within(screen.getByRole("group", { name: /ask explainllm about l2–3/i }));
    expect(questions.getAllByRole("button").map((button) => button.textContent)).toEqual(["Explain the syntax", "Why this way?", "What if I remove it?"]);

    fireEvent.click(questions.getByRole("button", { name: "Explain the syntax" }));
    expect(onAskAbout).toHaveBeenCalledWith({
      question: expect.stringContaining("Explain the syntax of this code"),
      path: "src/LikeButton.tsx",
      startLine: 2,
      endLine: 3,
      code: LIKE_BUTTON.split("\n").slice(1, 3).join("\n"),
    });
  });

  it("offers no questions when there is nowhere to send them", () => {
    renderTaught();
    fireEvent.click(hatFor(/what this step changed in likebutton\.tsx/i));
    act(() => { streams[0].chunk(LESSON); streams[0].done(); });

    expect(screen.queryByRole("group", { name: /ask explainllm/i })).not.toBeInTheDocument();
    expect(screen.getByText("Which line keeps the count?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /check my answer/i })).not.toBeInTheDocument();
  });

  it("ends a lesson with a question, and sends the reader's answer to be checked", () => {
    const onAskAbout = vi.fn();
    renderTaught({ onAskAbout });
    fireEvent.click(hatFor(/what this step changed in likebutton\.tsx/i));
    act(() => { streams[0].chunk(LESSON); streams[0].done(); });

    const send = screen.getByRole("button", { name: /check my answer/i });
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Which line keeps the count?"), { target: { value: "Line 2" } });
    fireEvent.click(send);

    expect(onAskAbout).toHaveBeenCalledWith({
      question: expect.stringMatching(/The lesson on `src\/LikeButton\.tsx` asked me: "Which line keeps the count\?"[\s\S]*My answer: Line 2/),
    });
  });

  it("counts the lessons opened, brings an opened step to the top, and offers no button to the next lesson", () => {
    renderTaught();
    expect(screen.getByLabelText("0 of 2 lessons opened")).toBeInTheDocument();

    fireEvent.click(hatFor(/what this step changed in likebutton\.tsx/i));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    act(() => { streams[0].chunk(LESSON); streams[0].done(); });
    expect(screen.getByLabelText("1 of 2 lessons opened")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next lesson/i })).not.toBeInTheDocument();

    fireEvent.click(hatFor(/what this step changed in app\.tsx/i));
    expect(streams[1].body).toEqual({ eventId: 12, level: "NEW" });
    act(() => { streams[1].chunk("Now the page shows it.\n\n### L1 · The export\nIt is shown.\n"); streams[1].done(); });
    expect(screen.getByLabelText("2 of 2 lessons opened")).toBeInTheDocument();
  });
});
