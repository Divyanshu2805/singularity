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

const renderTurn = (props: Partial<Parameters<typeof AssistantEvents>[0]> = {}) =>
  render(<AssistantEvents events={EVENTS} isStreaming={false} isIdle={false} {...props} />);

const stepRow = (label: string) => screen.getByText(label).closest("li")!;

describe("a build in the chat", () => {
  it("is one card: each step with the file it wrote beside it, and no second list of files", () => {
    renderTurn();

    expect(screen.getByText("Built")).toBeInTheDocument();
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

  it("draws no plan while it is being written: each file is a line as it arrives, with its step and its place", () => {
    const plan = EVENTS.slice(2, 4);
    const { unmount } = render(<AssistantEvents events={plan} isStreaming isIdle={false} />);
    expect(screen.queryByText("Plan")).not.toBeInTheDocument();
    expect(screen.queryByText("LikeButton.tsx")).not.toBeInTheDocument();
    unmount();

    render(<AssistantEvents events={[...plan, { type: ChatEventType.FILE_EDIT, filePath: "src/LikeButton.tsx", content: "x", isComplete: false }]} isStreaming isIdle={false} />);
    expect(screen.queryByText("Building")).not.toBeInTheDocument();
    const line = within(stepRow("Building the like button"));
    expect(line.getByText("LikeButton.tsx")).toBeInTheDocument();
    expect(line.getByText("1/2")).toBeInTheDocument();
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

    const card = screen.getByText("Built");
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
    render(<AssistantEvents events={BUILT} isStreaming={false} isIdle={false} teaching projectId={`p${project}`} {...props} />);

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
    expect(streams[0].body).toEqual({ eventId: 11 });
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

    expect(streams[0].body).toEqual({ eventId: 13 });
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
    render(<AssistantEvents events={OLD} isStreaming={false} isIdle={false} />);

    fireEvent.click(screen.getByRole("button", { name: /what this step does/i }));
    expect(screen.getByText("The heart button under each post.")).toBeInTheDocument();
    expect(screen.queryByText("Keeps the count in memory.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /line by line/i }));

    expect(screen.getByText("Keeps the count in memory.")).toBeInTheDocument();
  });

  it("jumps to the quoted line when its reference is clicked", () => {
    const onOpenFile = vi.fn();
    render(<AssistantEvents events={OLD} isStreaming={false} isIdle={false} onOpenFile={onOpenFile} />);

    fireEvent.click(screen.getByRole("button", { name: /what this step does/i }));
    fireEvent.click(screen.getByRole("button", { name: /line by line/i }));
    fireEvent.click(screen.getByTitle(/show line 2 of src\/LikeButton\.tsx/i));

    expect(onOpenFile).toHaveBeenCalledWith("src/LikeButton.tsx", { line: 2, code: "const [likes, setLikes] = useState(0);" });
  });
});
