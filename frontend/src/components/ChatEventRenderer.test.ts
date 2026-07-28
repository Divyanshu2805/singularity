/**
 * Covers how an assistant turn's raw events become the blocks the chat draws.
 *
 * In particular the checklist: which steps read as done, which as still running, and how a teaching-mode walkthrough
 * is folded underneath the step that wrote its file.
 */
import { describe, it, expect } from "vitest";
import { buildBlocks } from "./ChatEventRenderer";
import { ChatEvent, ChatEventType } from "@/lib/types";

const todo = (label: string, filePath?: string): ChatEvent =>
  ({ type: ChatEventType.TODO, content: label, filePath });

const edit = (filePath: string, isComplete = true): ChatEvent =>
  ({ type: ChatEventType.FILE_EDIT, content: "...", filePath, isComplete });

const message = (content: string): ChatEvent => ({ type: ChatEventType.MESSAGE, content });

const learn = (content: string, filePath?: string, isComplete = true, concept?: string): ChatEvent =>
  ({ type: ChatEventType.LEARN, content, filePath, metadata: concept, isComplete });

const fileWith = (filePath: string, content: string): ChatEvent => ({ type: ChatEventType.FILE_EDIT, content, filePath });

const walkthrough = (summary: string, parts: [code: string, text: string][] = []) =>
  `<summary>${summary}</summary>\n${parts.map(([code, text]) => `<part><code>${code}</code>${text}</part>`).join("\n")}`;

function checklist(events: ChatEvent[], isStreaming: boolean) {
  const block = buildBlocks(events, isStreaming).find((b) => b.kind === "checklist");
  return block?.kind === "checklist" ? block.items : [];
}

const statuses = (events: ChatEvent[], isStreaming: boolean) =>
  checklist(events, isStreaming).map((item) => item.status);

describe("build checklist", () => {
  it("collapses consecutive todos into one checklist, in order", () => {
    const items = checklist([
      todo("Creating the navigation bar", "src/Navbar.tsx"),
      todo("Wiring up the routes", "src/App.tsx"),
    ], true);

    expect(items.map((item) => item.label)).toEqual([
      "Creating the navigation bar",
      "Wiring up the routes",
    ]);
  });

  it("shows the first step running and the rest waiting before anything is written", () => {
    expect(statuses([
      todo("Creating the navigation bar", "src/Navbar.tsx"),
      todo("Wiring up the routes", "src/App.tsx"),
    ], true)).toEqual(["active", "pending"]);
  });

  it("ticks a step off when the file it named finishes", () => {
    expect(statuses([
      todo("Creating the navigation bar", "src/Navbar.tsx"),
      todo("Wiring up the routes", "src/App.tsx"),
      edit("src/Navbar.tsx"),
    ], true)).toEqual(["done", "active"]);
  });

  it("does not tick a step off while its file is still streaming", () => {
    expect(statuses([
      todo("Creating the navigation bar", "src/Navbar.tsx"),
      todo("Wiring up the routes", "src/App.tsx"),
      edit("src/Navbar.tsx", false),
    ], true)).toEqual(["active", "pending"]);
  });

  it("carries a step with no file of its own once a later step lands", () => {
    expect(statuses([
      todo("Sketching the layout"),
      todo("Wiring up the routes", "src/App.tsx"),
      edit("src/App.tsx"),
    ], true)).toEqual(["done", "done"]);
  });

  it("leaves a step whose file never arrived unticked once the response is over", () => {
    expect(statuses([
      todo("Creating the navigation bar", "src/Navbar.tsx"),
      todo("Wiring up the routes", "src/App.tsx"),
      edit("src/Navbar.tsx"),
    ], false)).toEqual(["done", "pending"]);
  });

  it("settles a fileless trailing step once the response is over", () => {
    expect(statuses([
      todo("Creating the navigation bar", "src/Navbar.tsx"),
      todo("Tidying up"),
      edit("src/Navbar.tsx"),
    ], false)).toEqual(["done", "done"]);
  });

  it("sees edits that arrive after it, and messages in between don't split it", () => {
    const events = [
      message("Here's the plan."),
      todo("Creating the navigation bar", "src/Navbar.tsx"),
      todo("Wiring up the routes", "src/App.tsx"),
      message("Writing the files now."),
      edit("src/Navbar.tsx"),
      edit("src/App.tsx"),
    ];
    expect(statuses(events, false)).toEqual(["done", "done"]);
    expect(buildBlocks(events, false).filter((b) => b.kind === "checklist")).toHaveLength(1);
  });

  it("shows a single step for a single-file change, without padding it out", () => {
    const items = checklist([todo("Fixing the header spacing", "src/Header.tsx")], true);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("active");
  });

  it("caps a runaway checklist at the same limit the parser saves", () => {
    const many = Array.from({ length: 30 }, (_, i) => todo(`Step ${i + 1}`, `file${i + 1}.tsx`));
    const items = checklist(many, true);
    expect(items).toHaveLength(12);
    expect(items[0].label).toBe("Step 1");
  });

  it("renders no checklist at all for a response that never announced one", () => {
    expect(buildBlocks([message("Just answering a question.")], false)
      .some((block) => block.kind === "checklist")).toBe(false);
  });
});

describe("teaching mode walkthroughs", () => {
  const steps = (events: ChatEvent[], isStreaming = false) => checklist(events, isStreaming);

  const editsBlocks = (events: ChatEvent[], isStreaming = false) =>
    buildBlocks(events, isStreaming).flatMap((block) => (block.kind === "edits" ? [block] : []));

  const lessonBlocks = (events: ChatEvent[], isStreaming = false) =>
    buildBlocks(events, isStreaming).flatMap((block) => (block.kind === "lessons" ? [block] : []));

  const TIMER = [
    'import { useState } from "react";',
    "",
    "export function useTimer(start: number) {",
    "  const [left, setLeft] = useState(start);",
    '  return <button type="button" onClick={() => setLeft(start)}>Reset</button>;',
    "}",
  ].join("\n");

  it("puts each walkthrough under the build step that wrote its file", () => {
    const events = [
      todo("Building the timer logic", "src/hooks/useTimer.ts"),
      todo("Wiring up the routes", "src/App.tsx"),
      edit("src/hooks/useTimer.ts"),
      learn(walkthrough("The timer's counting logic."), "src/hooks/useTimer.ts"),
      edit("src/App.tsx"),
      learn(walkthrough("The app's main screen."), "src/App.tsx"),
    ];

    expect(steps(events).map((item) => [item.label, item.lessons[0]?.lesson.summary])).toEqual([
      ["Building the timer logic", "The timer's counting logic."],
      ["Wiring up the routes", "The app's main screen."],
    ]);
  });

  it("leaves the edits card a plain list of files, in one card", () => {
    const cards = editsBlocks([
      todo("Building the timer logic", "src/hooks/useTimer.ts"),
      todo("Wiring up the routes", "src/App.tsx"),
      edit("src/hooks/useTimer.ts"),
      learn(walkthrough("The timer's counting logic."), "src/hooks/useTimer.ts"),
      edit("src/App.tsx"),
      learn(walkthrough("The app's main screen."), "src/App.tsx"),
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0].items.map((item) => item.path)).toEqual(["src/hooks/useTimer.ts", "src/App.tsx"]);
    expect(cards[0].items.every((item) => !("lesson" in item))).toBe(true);
  });

  it("finds the line each part quotes in that file, as the turn wrote it", () => {
    const [step] = steps([
      todo("Building the timer logic", "src/hooks/useTimer.ts"),
      fileWith("src/hooks/useTimer.ts", TIMER),
      learn(walkthrough("Counts down.", [
        ["export function useTimer(start: number) {", "Creates the timer."],
        ["const [left, setLeft] = useState(start);", "Remembers the time left."],
        ['onClick={() => setLeft(start)}', "Puts the time back."],
      ]), "src/hooks/useTimer.ts"),
    ]);

    expect(step.lessons[0]?.lesson.parts.map((part) => part.line)).toEqual([3, 4, 5]);
  });

  it("leaves a step with no walkthrough without one", () => {
    const events = [
      todo("Restyling the page", "src/App.css"),
      todo("Wiring up the routes", "src/App.tsx"),
      edit("src/App.css"),
      edit("src/App.tsx"),
      learn(walkthrough("Main screen."), "src/App.tsx"),
    ];

    expect(steps(events).map((item) => item.lessons.length > 0)).toEqual([false, true]);
  });

  it("falls back to the file a walkthrough follows when its path names no written file", () => {
    const [step] = steps([
      todo("Wiring up the routes", "src/App.tsx"),
      fileWith("src/App.tsx", TIMER),
      learn(walkthrough("Main screen.", [["useState(start)", "x"]]), "/src/app.tsx"),
    ]);

    expect(step.lessons[0]?.lesson.summary).toBe("Main screen.");
    expect(step.lessons[0]?.lesson.parts[0].line).toBe(4);
  });

  it("keeps only the first walkthrough for a file, like the backend does", () => {
    const [step] = steps([
      todo("Wiring up the routes", "src/App.tsx"),
      edit("src/App.tsx"),
      learn(walkthrough("First."), "src/App.tsx"),
      learn(walkthrough("Second."), "src/App.tsx"),
    ]);

    expect(step.lessons[0]?.lesson.summary).toBe("First.");
  });

  it("shows walkthroughs with no build step to sit under in their own card, after the edits", () => {
    const blocks = buildBlocks([
      edit("src/App.tsx"),
      learn(walkthrough("The app's main screen."), "src/App.tsx"),
      edit("src/main.tsx"),
      learn(walkthrough("Starts the app."), "src/main.tsx"),
    ], false);

    expect(blocks.map((block) => block.kind)).toEqual(["edits", "lessons"]);
    expect(lessonBlocks([
      edit("src/App.tsx"),
      learn(walkthrough("The app's main screen."), "src/App.tsx"),
      edit("src/main.tsx"),
      learn(walkthrough("Starts the app."), "src/main.tsx"),
    ])[0].items.map((item) => [item.path, item.lesson.summary])).toEqual([
      ["src/App.tsx", "The app's main screen."],
      ["src/main.tsx", "Starts the app."],
    ]);
  });

  it("shows a walkthrough about no file at all rather than dropping it", () => {
    const blocks = buildBlocks([message("Here's the idea."), learn(walkthrough("Reusable pieces of UI."))], false);

    expect(blocks.map((block) => block.kind)).toEqual(["message", "lessons"]);
  });

  it("marks a walkthrough still being written, tidying its prose but never its quoted code", () => {
    const [step] = steps([
      todo("Adding the page styles", "src/theme.ts"),
      fileWith("src/theme.ts", "const styles = `\n  color: red;\n`;"),
      learn("<summary>Holds the page's styles.</summary><part><code>const styles = `</code>Starts a block of **CSS", "src/theme.ts", false),
    ], true);

    const lesson = step.lessons[0].lesson;
    expect(lesson.isComplete).toBe(false);
    expect(lesson.parts[0]).toMatchObject({ code: "const styles = `", line: 1, text: "Starts a block of CSS" });
  });

  it("still shows a one-sentence lesson saved before walkthroughs existed", () => {
    const [step] = steps([
      todo("Wiring up the routes", "src/App.tsx"),
      edit("src/App.tsx"),
      learn("Composition means building a screen from smaller pieces.", "src/App.tsx", true, "Composition"),
    ]);

    expect(step.lessons[0]?.lesson).toMatchObject({
      summary: "means building a screen from smaller pieces.",
      parts: [],
      concepts: ["Composition"],
    });
  });

  it("does not let walkthroughs change how the checklist ticks off", () => {
    const events = [
      todo("Building the timer logic", "src/hooks/useTimer.ts"),
      todo("Wiring up the routes", "src/App.tsx"),
      edit("src/hooks/useTimer.ts"),
      learn(walkthrough("Counts down."), "src/hooks/useTimer.ts"),
    ];

    expect(statuses(events, true)).toEqual(["done", "active"]);
  });
});

describe("renaming a file", () => {
  const events: ChatEvent[] = [
    { type: ChatEventType.TODO, content: "Creating the renamed page", filePath: "src/pages/NewPage.tsx" },
    { type: ChatEventType.TODO, content: "Removing the old page", filePath: "src/pages/OldPage.tsx" },
    { type: ChatEventType.FILE_EDIT, content: "export default null;", filePath: "src/pages/NewPage.tsx" },
    { type: ChatEventType.FILE_DELETE, content: "Replaced by NewPage.tsx", filePath: "src/pages/OldPage.tsx" },
  ];

  it("ticks off the delete step and lists the old file as deleted in the same card", () => {
    const blocks = buildBlocks(events, false);
    const checklist = blocks.find((b) => b.kind === "checklist");
    const edits = blocks.filter((b) => b.kind === "edits");

    expect(checklist?.kind === "checklist" && checklist.items.map((item) => item.status)).toEqual(["done", "done"]);
    expect(edits).toHaveLength(1);
    expect(edits[0].kind === "edits" && edits[0].items).toEqual([
      { path: "src/pages/NewPage.tsx", active: false },
      { path: "src/pages/OldPage.tsx", active: false, deleted: true },
    ]);
  });
});
