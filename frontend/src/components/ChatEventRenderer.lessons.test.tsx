import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AssistantEvents } from "./ChatEventRenderer";
import { ChatEvent, ChatEventType } from "@/lib/types";

const LIKE_BUTTON = [
  "export function LikeButton() {",
  "  const [likes, setLikes] = useState(0);",
  "  return <button onClick={() => setLikes(likes + 1)}>{likes}</button>;",
  "}",
].join("\n");

const EVENTS: ChatEvent[] = [
  { type: ChatEventType.TODO, content: "Building the like button", filePath: "src/LikeButton.tsx" },
  { type: ChatEventType.TODO, content: "Showing it on the page", filePath: "src/App.tsx" },
  { type: ChatEventType.FILE_EDIT, filePath: "src/LikeButton.tsx", content: LIKE_BUTTON },
  {
    type: ChatEventType.LEARN,
    filePath: "src/LikeButton.tsx",
    content:
      '<summary>The heart button under each post.</summary>' +
      '<part concept="State"><code>const [likes, setLikes] = useState(0);</code>Keeps the count in memory.</part>',
  },
  { type: ChatEventType.FILE_EDIT, filePath: "src/App.tsx", content: "export default App;" },
  { type: ChatEventType.LEARN, filePath: "src/App.tsx", content: "<summary>The app's main screen.</summary>" },
];

const renderTurn = (onOpenFile = vi.fn()) => {
  render(<AssistantEvents events={EVENTS} isStreaming={false} isIdle={false} onOpenFile={onOpenFile} />);
  return onOpenFile;
};

const toggleFor = (fileName: string) =>
  screen.getByRole("button", { name: new RegExp(`how it works \\(${fileName.replace(".", "\\.")}\\)`, "i") });

describe("walkthroughs in the chat", () => {
  it("start folded - nothing is open until the learner asks", () => {
    renderTurn();

    const toggles = screen.getAllByRole("button", { name: /how it works/i });
    expect(toggles).toHaveLength(2);
    toggles.forEach((toggle) => expect(toggle).toHaveAttribute("aria-expanded", "false"));
    expect(screen.queryByText("The heart button under each post.")).not.toBeInTheDocument();
    expect(screen.queryByText("The app's main screen.")).not.toBeInTheDocument();
  });

  it("sit under their build step, not on the edited file's row", () => {
    renderTurn();

    // The step that wrote the file carries the walkthrough...
    const step = screen.getByText("Building the like button");
    expect(step.closest("li")).toContainElement(toggleFor("LikeButton.tsx"));

    // ...while the "Edited 2 files" card is a plain list of files, with nothing to unfold.
    const editsCard = screen.getByText("Edited 2 files").closest("div.overflow-hidden")!;
    expect(editsCard.querySelectorAll("li")).toHaveLength(2);
    expect(editsCard.querySelector("[aria-expanded]")).toBeNull();
  });

  it("name the file each step is about, without making it a link", () => {
    renderTurn();

    const row = screen.getByText("Building the like button").closest("li")!;
    // Shown so you can see what a step touched...
    expect(row).toHaveTextContent("LikeButton.tsx");
    // ...but it isn't a way in: a jump from here would land at the top of the file, not at the explained line.
    expect([...row.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      expect.stringContaining("How it works"),
    ]);
  });

  it("give a step no way to open a file of its own - the quoted lines do that", () => {
    renderTurn();

    // Only the "How it works" toggle is actionable on the row; opening a file at its top would land the
    // learner somewhere other than the line the step is about.
    const row = screen.getByText("Building the like button").closest("li")!;
    const actions = [...row.querySelectorAll("button")].filter((button) => !button.hasAttribute("aria-expanded"));
    expect(actions).toHaveLength(0);
  });

  it("open just the file the learner picks", () => {
    renderTurn();

    fireEvent.click(toggleFor("LikeButton.tsx"));

    expect(toggleFor("LikeButton.tsx")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("The heart button under each post.")).toBeInTheDocument();
    expect(screen.getByText("Keeps the count in memory.")).toBeInTheDocument();
    expect(screen.getByText("State")).toBeInTheDocument();
    expect(screen.queryByText("The app's main screen.")).not.toBeInTheDocument();

    fireEvent.click(toggleFor("LikeButton.tsx"));
    expect(screen.queryByText("The heart button under each post.")).not.toBeInTheDocument();
  });

  it("open and close all of a card's walkthroughs from its header", () => {
    renderTurn();

    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByText("The heart button under each post.")).toBeInTheDocument();
    expect(screen.getByText("The app's main screen.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.queryByText("The heart button under each post.")).not.toBeInTheDocument();
    expect(screen.queryByText("The app's main screen.")).not.toBeInTheDocument();
  });

  it("jump to the quoted line when its reference is clicked", () => {
    const onOpenFile = renderTurn();
    fireEvent.click(toggleFor("LikeButton.tsx"));

    fireEvent.click(screen.getByRole("button", { name: /^L2/ }));
    expect(onOpenFile).toHaveBeenCalledWith("src/LikeButton.tsx", { line: 2, code: "const [likes, setLikes] = useState(0);" });
  });
});

describe("a build step that wrote more than one file", () => {
  const MULTI: ChatEvent[] = [
    { type: ChatEventType.TODO, content: "Building the like button", filePath: "src/LikeButton.tsx" },
    { type: ChatEventType.FILE_EDIT, filePath: "src/LikeButton.tsx", content: LIKE_BUTTON },
    {
      type: ChatEventType.LEARN,
      filePath: "src/LikeButton.tsx",
      content: "<summary>The heart button.</summary><part><code>const [likes, setLikes] = useState(0);</code>Keeps the count.</part>",
    },
    // A second file the same step needed - no <todo> of its own names it.
    { type: ChatEventType.FILE_EDIT, filePath: "src/useLikes.ts", content: "export const useLikes = () => 0;" },
    {
      type: ChatEventType.LEARN,
      filePath: "src/useLikes.ts",
      content: "<summary>Where the count is kept.</summary><part><code>export const useLikes = () => 0;</code>Hands back the count.</part>",
    },
  ];

  it("folds both walkthroughs under the one step, and says which file each line is from", () => {
    const onOpenFile = vi.fn();
    render(<AssistantEvents events={MULTI} isStreaming={false} isIdle={false} onOpenFile={onOpenFile} />);

    const toggle = screen.getByRole("button", { name: /how it works/i });
    expect(toggle).toHaveTextContent("(2 files)");

    fireEvent.click(toggle);
    expect(screen.getByText("The heart button.")).toBeInTheDocument();
    expect(screen.getByText("Where the count is kept.")).toBeInTheDocument();

    // Each quoted line is labelled with its file, since the line number alone wouldn't say which.
    const reference = screen.getByRole("button", { name: /useLikes\.ts L1/ });
    fireEvent.click(reference);
    expect(onOpenFile).toHaveBeenCalledWith("src/useLikes.ts", { line: 1, code: "export const useLikes = () => 0;" });
  });
});
