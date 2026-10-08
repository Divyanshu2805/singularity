/**
 * Covers how an assistant turn's raw events become the blocks the chat draws.
 *
 * In particular the build card: that the steps and the files they wrote are one block and not two, which steps read as
 * done and which as still running, where a file nobody listed ends up, and that a teaching-mode lesson sits on the
 * step it is about whether it was written before its file (as it is now) or after it (as saved conversations have it).
 */
import { describe, it, expect } from "vitest";
import { activitySummary, buildBlocks, displayBlocks } from "./ChatEventRenderer";
import { ChatEvent, ChatEventType } from "@/lib/types";

const todo = (label: string, filePath?: string): ChatEvent =>
  ({ type: ChatEventType.TODO, content: label, filePath });

const edit = (filePath: string, isComplete = true): ChatEvent =>
  ({ type: ChatEventType.FILE_EDIT, content: "...", filePath, isComplete });

const message = (content: string): ChatEvent => ({ type: ChatEventType.MESSAGE, content });

const learn = (content: string, filePath?: string, isComplete = true, concept?: string): ChatEvent =>
  ({ type: ChatEventType.LEARN, content, filePath, metadata: concept, isComplete });

const fileWith = (filePath: string, content: string): ChatEvent => ({ type: ChatEventType.FILE_EDIT, content, filePath });

const lesson = (what: string, why: string) => `<what>${what}</what>\n<why>${why}</why>`;

const walkthrough = (summary: string, parts: [code: string, text: string][] = []) =>
  `<summary>${summary}</summary>\n${parts.map(([code, text]) => `<part><code>${code}</code>${text}</part>`).join("\n")}`;

function build(events: ChatEvent[], isStreaming: boolean) {
  const block = buildBlocks(events, isStreaming).find((b) => b.kind === "build");
  return block?.kind === "build" ? block : undefined;
}

const steps = (events: ChatEvent[], isStreaming: boolean) => build(events, isStreaming)?.steps ?? [];

const statuses = (events: ChatEvent[], isStreaming: boolean) => steps(events, isStreaming).map((step) => step.status);

const kinds = (events: ChatEvent[], isStreaming = false) => buildBlocks(events, isStreaming).map((block) => block.kind);

describe("the build card", () => {
  it("is one block holding the steps and the files they wrote - never a checklist and a second list of files", () => {
    const events = [
      message("Starting with the navigation."),
      todo("Creating the navigation bar", "src/Navbar.tsx"),
      todo("Wiring up the routes", "src/App.tsx"),
      edit("src/Navbar.tsx"),
      edit("src/App.tsx"),
      message("Both are in."),
    ];

    expect(kinds(events)).toEqual(["message", "build", "message"]);
    expect(steps(events, false).map((step) => [step.label, step.files.map((file) => file.path)])).toEqual([
      ["Creating the navigation bar", ["src/Navbar.tsx"]],
      ["Wiring up the routes", ["src/App.tsx"]],
    ]);
  });

  it("is a plan until the first file starts arriving", () => {
    const planned = [todo("Creating the navigation bar", "src/Navbar.tsx"), todo("Wiring up the routes", "src/App.tsx")];

    expect(build(planned, true)).toMatchObject({ isPlanned: true, hasStarted: false, isRunning: true });
    expect(build([...planned, edit("src/Navbar.tsx", false)], true)).toMatchObject({ hasStarted: true });
  });

  it("shows the first step running and the rest waiting before anything is written", () => {
    expect(statuses([todo("One", "a.tsx"), todo("Two", "b.tsx"), todo("Three", "c.tsx")], true))
      .toEqual(["active", "pending", "pending"]);
  });

  it("ticks a step off when the file it named finishes, and not while that file is still streaming", () => {
    const plan = [todo("Creating the navigation bar", "src/Navbar.tsx"), todo("Wiring up the routes", "src/App.tsx")];

    expect(statuses([...plan, edit("src/Navbar.tsx")], true)).toEqual(["done", "active"]);
    expect(statuses([...plan, edit("src/Navbar.tsx", false)], true)).toEqual(["active", "pending"]);
    expect(steps([...plan, edit("src/Navbar.tsx", false)], true)[0].files).toEqual([
      { path: "src/Navbar.tsx", active: true, lines: 1, content: "..." },
    ]);
  });

  it("carries a step with no file of its own once a later step lands", () => {
    expect(statuses([todo("Planning"), todo("Wiring up the routes", "src/App.tsx"), edit("src/App.tsx")], true))
      .toEqual(["done", "done"]);
  });

  it("leaves a step whose file never arrived unticked once the response is over", () => {
    expect(statuses([todo("One", "src/Navbar.tsx"), todo("Two", "src/App.tsx"), edit("src/Navbar.tsx")], false))
      .toEqual(["done", "pending"]);
  });

  it("settles a fileless trailing step once the response is over", () => {
    expect(statuses([todo("One", "src/Navbar.tsx"), todo("Tidying up"), edit("src/Navbar.tsx")], false))
      .toEqual(["done", "done"]);
  });

  it("counts how many lines each finished file has", () => {
    const [step] = steps([todo("Adding the hook", "src/useTimer.ts"), fileWith("src/useTimer.ts", "a\nb\nc\n")], false);

    expect(step.files).toEqual([{ path: "src/useTimer.ts", active: false, lines: 3, content: "a\nb\nc\n" }]);
  });

  it("puts a second file written for a step under that step, while later steps are still to come", () => {
    const events = [
      todo("Building the like button", "src/LikeButton.tsx"),
      todo("Showing it on the page", "src/App.tsx"),
      edit("src/LikeButton.tsx"),
      edit("src/hooks/useLikes.ts"),
      edit("src/App.tsx"),
    ];

    expect(steps(events, false).map((step) => step.files.map((file) => file.path))).toEqual([
      ["src/LikeButton.tsx", "src/hooks/useLikes.ts"],
      ["src/App.tsx"],
    ]);
    expect(statuses(events, false)).toEqual(["done", "done"]);
  });

  it("gives a file written after the plan was finished a row of its own, so the card is still the whole record", () => {
    const events = [
      todo("Building the like button", "src/LikeButton.tsx"),
      edit("src/LikeButton.tsx"),
      message("Fixing an import."),
      edit("package.json"),
    ];

    expect(kinds(events)).toEqual(["build", "message"]);
    expect(steps(events, false)).toMatchObject([
      { label: "Building the like button", status: "done" },
      { label: "package.json", isExtra: true, status: "done", files: [{ path: "package.json" }] },
    ]);
  });

  it("does not let a late extra file tick off a planned step that was never written", () => {
    const events = [todo("One", "a.tsx"), todo("Two", "b.tsx"), edit("a.tsx"), edit("b.tsx", false), edit("zzz.json")];

    expect(statuses(events, false).slice(0, 2)).toEqual(["done", "pending"]);
  });

  it("shows a single step for a single-file change, without padding it out", () => {
    expect(steps([todo("Fixing the title", "index.html"), edit("index.html")], false)).toHaveLength(1);
  });

  it("caps a runaway plan at the same limit the parser saves", () => {
    const runaway = Array.from({ length: 20 }, (_, index) => todo(`Step ${index}`, `src/${index}.tsx`));

    expect(steps(runaway, true)).toHaveLength(12);
  });

  it("lists the files of a response that never announced a plan, one row each", () => {
    const events = [message("Two small fixes."), edit("src/App.tsx"), edit("src/main.tsx"), message("Done.")];

    expect(kinds(events)).toEqual(["message", "build", "message"]);
    expect(build(events, false)).toMatchObject({
      isPlanned: false,
      steps: [{ label: "App.tsx", isExtra: true, status: "done" }, { label: "main.tsx", isExtra: true, status: "done" }],
    });
  });

  it("renders no build card at all for a response that only talked", () => {
    expect(kinds([message("Routing lives in App.tsx.")])).toEqual(["message"]);
  });
});

describe("renaming a file", () => {
  const events: ChatEvent[] = [
    { type: ChatEventType.TODO, content: "Creating the renamed page", filePath: "src/pages/NewPage.tsx" },
    { type: ChatEventType.TODO, content: "Removing the old page", filePath: "src/pages/OldPage.tsx" },
    { type: ChatEventType.FILE_EDIT, content: "export default null;", filePath: "src/pages/NewPage.tsx" },
    { type: ChatEventType.FILE_DELETE, content: "Replaced by NewPage.tsx", filePath: "src/pages/OldPage.tsx" },
  ];

  it("ticks off the delete step and shows the old file as deleted on it", () => {
    expect(steps(events, false)).toMatchObject([
      { status: "done", files: [{ path: "src/pages/NewPage.tsx", active: false, lines: 1 }] },
      { status: "done", files: [{ path: "src/pages/OldPage.tsx", active: false, deleted: true }] },
    ]);
  });
});

describe("the model's working-out", () => {
  const thinking = (content: string, isComplete = true): ChatEvent => ({ type: ChatEventType.THINKING, content, isComplete });

  it("is a block of its own ahead of the answer, live only while it is still arriving", () => {
    const arriving = buildBlocks([thinking("One page, so no rou", false)], true);
    const settled = buildBlocks([thinking("One page, so no router."), message("Starting with the list.")], true);

    expect(arriving).toMatchObject([{ kind: "thinking", content: "One page, so no rou", active: true }]);
    expect(settled).toMatchObject([{ kind: "thinking", active: false }, { kind: "message" }]);
  });

  it("does not split a plan from the files written under it", () => {
    const events = [thinking("Types first."), todo("One", "a.ts"), edit("a.ts")];

    expect(kinds(events)).toEqual(["thinking", "build"]);
  });
});

describe("teaching mode lessons", () => {
  const TIMER = lesson("Adds the countdown's memory.", "Without it the clock would reset on every redraw.");
  const APP = lesson("Shows the countdown on the page.", "The hook exists now, so the screen can use it.");

  it("sits on the step it is about when it is written before that step's file", () => {
    const events = [
      todo("Adding the timer hook", "src/hooks/useTimer.ts"),
      todo("Showing the countdown", "src/App.tsx"),
      learn(TIMER, "src/hooks/useTimer.ts", true, "Custom hook"),
      edit("src/hooks/useTimer.ts"),
      learn(APP, "src/App.tsx"),
      edit("src/App.tsx"),
    ];

    expect(kinds(events)).toEqual(["build"]);
    expect(steps(events, false).map((step) => step.lessons.map((one) => one.lesson))).toMatchObject([
      [{ summary: "Adds the countdown's memory.", why: "Without it the clock would reset on every redraw.", concepts: ["Custom hook"], isComplete: true }],
      [{ summary: "Shows the countdown on the page.", why: "The hook exists now, so the screen can use it." }],
    ]);
  });

  it("is on its step while it is still being written, before the file has begun", () => {
    const [step] = steps([todo("Adding the timer hook", "src/useTimer.ts"), learn("<what>Adds the count", "src/useTimer.ts", false)], true);

    expect(step).toMatchObject({ status: "active", files: [], lessons: [{ lesson: { summary: "Adds the count", isComplete: false } }] });
  });

  it("puts the lesson for a step's second file under the same step, each naming its file", () => {
    const events = [
      todo("Building the like button", "src/LikeButton.tsx"),
      todo("Showing it on the page", "src/App.tsx"),
      learn(TIMER, "src/LikeButton.tsx"),
      edit("src/LikeButton.tsx"),
      learn(APP, "src/hooks/useLikes.ts"),
      edit("src/hooks/useLikes.ts"),
    ];

    expect(steps(events, true)[0].lessons.map((one) => one.path)).toEqual(["src/LikeButton.tsx", "src/hooks/useLikes.ts"]);
    expect(steps(events, true)[0].files.map((file) => file.path)).toEqual(["src/LikeButton.tsx", "src/hooks/useLikes.ts"]);
  });

  it("gets a row of its own, with its file, when the response announced no plan", () => {
    const events = [learn(TIMER, "src/useTimer.ts"), edit("src/useTimer.ts"), learn(APP, "src/App.tsx"), edit("src/App.tsx")];

    expect(steps(events, false).map((step) => [step.label, step.files.length, step.lessons.length])).toEqual([
      ["useTimer.ts", 1, 1],
      ["App.tsx", 1, 1],
    ]);
  });

  it("keeps only the first lesson for a file, like the backend does", () => {
    const events = [todo("One", "src/App.tsx"), learn(TIMER, "src/App.tsx"), edit("src/App.tsx"), learn(APP, "src/App.tsx")];

    expect(steps(events, false)[0].lessons).toHaveLength(1);
    expect(steps(events, false)[0].lessons[0].lesson.summary).toBe("Adds the countdown's memory.");
  });

  it("does not change how the steps tick off", () => {
    const events = [todo("One", "a.ts"), todo("Two", "b.ts"), learn(TIMER, "a.ts"), edit("a.ts"), learn(APP, "b.ts")];

    expect(statuses(events, true)).toEqual(["done", "active"]);
  });

  it("shows a lesson about no file at all in a card of its own rather than dropping it", () => {
    expect(buildBlocks([learn("Components are reusable pieces of a page.")], false)).toMatchObject([
      { kind: "lessons", items: [{ lesson: { summary: "Components are reusable pieces of a page." } }] },
    ]);
  });
});

describe("walkthroughs saved before lessons became a what and a why", () => {
  const TIMER_FILE = "import { useState } from 'react';\n\nexport function useTimer() {\n  const [left, setLeft] = useState(60);\n  return left;\n}\n";

  it("still sit on the step that wrote their file, though they come after it", () => {
    const events = [
      todo("Adding the timer hook", "src/hooks/useTimer.ts"),
      todo("Showing the countdown", "src/App.tsx"),
      edit("src/hooks/useTimer.ts"),
      learn(walkthrough("The countdown's memory."), "src/hooks/useTimer.ts"),
      edit("src/App.tsx"),
      learn(walkthrough("The screen."), "src/App.tsx"),
    ];

    expect(kinds(events)).toEqual(["build"]);
    expect(steps(events, false).map((step) => step.lessons.map((one) => one.lesson.summary))).toEqual([
      ["The countdown's memory."],
      ["The screen."],
    ]);
  });

  it("find the line each part quotes in that file, as the turn wrote it", () => {
    const events = [
      todo("Adding the timer hook", "src/hooks/useTimer.ts"),
      fileWith("src/hooks/useTimer.ts", TIMER_FILE),
      learn(walkthrough("The countdown's memory.", [["const [left, setLeft] = useState(60);", "Keeps the seconds left."]]), "src/hooks/useTimer.ts"),
    ];

    expect(steps(events, false)[0].lessons[0].lesson.parts).toMatchObject([{ line: 4, text: "Keeps the seconds left." }]);
  });

  it("fall back to the file they follow when their path names no written file", () => {
    const events = [
      todo("Adding the timer hook", "src/hooks/useTimer.ts"),
      fileWith("src/hooks/useTimer.ts", TIMER_FILE),
      learn(walkthrough("The countdown's memory.", [["export function useTimer() {", "The hook."]]), "src/hooks/timer.ts"),
    ];

    expect(steps(events, false)[0].lessons).toMatchObject([{ path: "src/hooks/useTimer.ts", lesson: { parts: [{ line: 3 }] } }]);
  });

  it("show a one-sentence lesson from before walkthroughs existed", () => {
    const events = [todo("One", "src/App.tsx"), edit("src/App.tsx"), learn("State is memory for a component.", "src/App.tsx", true, "State")];

    expect(steps(events, false)[0].lessons[0].lesson).toMatchObject({ summary: "is memory for a component.", concepts: ["State"], parts: [] });
  });

  it("are tidied while still being written, but never their quoted code", () => {
    const events = [
      edit("src/App.tsx"),
      learn("<summary>Uses **bold</summary><part><code>const a = `x`;</code>Half a `name", "src/App.tsx", false),
    ];
    const [{ lesson: partial }] = steps(events, true)[0].lessons;

    expect(partial).toMatchObject({ summary: "Uses bold", isComplete: false });
    expect(partial.parts[0]).toMatchObject({ code: "const a = `x`;", text: "Half a name" });
  });
});

describe("questions for the user", () => {
  const ask = (content: string, metadata?: string, isComplete = true): ChatEvent =>
    ({ type: ChatEventType.ASK, content, metadata, isComplete });

  it("groups a turn's consecutive questions into one block with their suggested answers", () => {
    const blocks = buildBlocks(
      [
        { type: ChatEventType.MESSAGE, content: "Two things first." },
        ask("How should people sign in?", "Email|Google"),
        ask("Which city is this for?"),
      ],
      false
    );

    expect(blocks.map((block) => block.kind)).toEqual(["message", "ask"]);
    expect(blocks[1]).toMatchObject({
      kind: "ask",
      questions: [
        { question: "How should people sign in?", options: ["Email", "Google"], isComplete: true },
        { question: "Which city is this for?", options: [], isComplete: true },
      ],
    });
  });

  it("shows no suggestions for a question that is still arriving", () => {
    const [block] = buildBlocks([ask("How should peo", "Email|Goo", false)], true);

    expect(block).toMatchObject({ kind: "ask", questions: [{ options: [], isComplete: false }] });
  });

  it("can come after the part of a build the turn did write", () => {
    const events = [todo("Adding the list", "src/List.tsx"), edit("src/List.tsx"), message("The list is in."), ask("Cards or a table?", "Cards|A table")];

    expect(kinds(events)).toEqual(["build", "message", "ask"]);
  });
});

describe("the order a turn is shown in", () => {
  const todo = (path: string, content: string): ChatEvent => ({ type: ChatEventType.TODO, filePath: path, content });
  const file = (path: string, isComplete = true): ChatEvent => ({ type: ChatEventType.FILE_EDIT, filePath: path, content: "a\nb", isComplete });
  const said = (content: string): ChatEvent => ({ type: ChatEventType.MESSAGE, content });
  const TURN: ChatEvent[] = [
    said("Starting with the data."),
    todo("src/lib/notes.ts", "Keeping notes in the browser"),
    todo("src/pages/Index.tsx", "Putting the page together"),
    file("src/lib/notes.ts"),
    said("The data is in place; now the page."),
    file("src/pages/Index.tsx", false),
  ];

  it("is the order things happen while the turn is being written, with no plan card", () => {
    const blocks = displayBlocks(TURN, true);

    expect(blocks.map((block) => block.kind)).toEqual(["message", "activity", "message", "activity"]);
    const first = blocks[1] as Extract<(typeof blocks)[number], { kind: "activity" }>;
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({ label: "Keeping notes in the browser", position: 1, total: 2 });
    const second = blocks[3] as typeof first;
    expect(second.items[0]).toMatchObject({ label: "Putting the page together", position: 2, total: 2 });
    expect(second.items[0].file.active).toBe(true);
  });

  it("names a file nobody planned by what is being done to it", () => {
    const blocks = displayBlocks([said("Fixing it."), { type: ChatEventType.FILE_PATCH, filePath: "src/App.tsx", content: "", isComplete: true }], true);

    const activity = blocks[1] as Extract<(typeof blocks)[number], { kind: "activity" }>;
    expect(activity.items[0].label).toBeUndefined();
    expect(activity.items[0].file.edited).toBe(true);
    expect(activity.items[0].position).toBeUndefined();
  });

  it("shows a file once however many times the turn wrote it", () => {
    const blocks = displayBlocks([file("src/App.tsx"), said("Mending it."), file("src/App.tsx")], true);

    expect(blocks.filter((block) => block.kind === "activity")).toHaveLength(1);
  });

  it("folds the files to a line each and puts the build card last once the turn is saved", () => {
    const saved = TURN.map((event) => ({ ...event, isComplete: true }));
    const blocks = displayBlocks([...saved, said("Type a note and press Enter.")], false);

    expect(blocks.map((block) => block.kind)).toEqual(["message", "activity", "message", "activity", "message", "build"]);
    expect(blocks.filter((block) => block.kind === "activity").every((block) => "isSummary" in block && block.isSummary)).toBe(true);
  });

  it("keeps a question last, after the card", () => {
    const blocks = displayBlocks([file("src/App.tsx"), { type: ChatEventType.ASK, content: "Which colour?", metadata: "Red|Blue" }], false);

    expect(blocks.map((block) => block.kind)).toEqual(["activity", "build", "ask"]);
  });

  it("leaves a turn that wrote nothing exactly as it was", () => {
    const events = [said("The routing lives in src/App.tsx.")];

    expect(displayBlocks(events, false)).toEqual(buildBlocks(events, false));
  });

  it("counts what a group of files did", () => {
    const item = (deleted: boolean) => ({ key: "k", file: { path: "a", active: false, ...(deleted ? { deleted: true } : {}) } });

    expect(activitySummary([item(false)])).toBe("1 file written");
    expect(activitySummary([item(false), item(false), item(true)])).toBe("2 files written, 1 removed");
    expect(activitySummary([item(true)])).toBe("1 removed");
  });
});
