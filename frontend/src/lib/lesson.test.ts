/**
 * Covers parsing a teaching-mode walkthrough: its summary and parts, showing as much as has arrived without half a
 * closing tag, coping with parts the model forgot to close, dropping tags a lesson saved in an older shape still
 * carries, undoing HTML escaping nobody asked for, and treating a body with no tags as a one-sentence lesson.
 *
 * Also covers not repeating a concept's name when the sentence already opens with it, reading a streamed walkthrough
 * into its overview and line-ranged sections, and cutting a section's lines out of a file.
 */
import { describe, it, expect } from "vitest";
import { findCodeLine, linesOf, parseLesson, parseWalkthrough, withLines, withoutLeadingConcept } from "./lesson";

const FULL = `<summary>The heart button under each post.</summary>
<part concept="Props"><code>export function LikeButton({ initialLikes }: LikeButtonProps) {</code>Creates the button.</part>
<part concept="State"><code>const [likes, setLikes] = useState(initialLikes);</code>Keeps the count in memory.</part>
<part><code>onClick={() => setLikes(likes + 1)}</code>Adds one like per click.</part>
<related path="src/components/PostCard.tsx">shows this button under every post</related>`;

const FILE = `import { useState } from "react";

export function LikeButton({ initialLikes }: LikeButtonProps) {
  const [likes, setLikes] = useState(initialLikes);
  return (
    <button type="button" onClick={() => setLikes(likes + 1)}>
      {likes}
    </button>
  );
}`;

describe("parseLesson", () => {
  it("reads a walkthrough's summary and parts", () => {
    expect(parseLesson(FULL)).toEqual({
      summary: "The heart button under each post.",
      parts: [
        { code: "export function LikeButton({ initialLikes }: LikeButtonProps) {", text: "Creates the button.", concept: "Props" },
        { code: "const [likes, setLikes] = useState(initialLikes);", text: "Keeps the count in memory.", concept: "State" },
        { code: "onClick={() => setLikes(likes + 1)}", text: "Adds one like per click.", concept: undefined },
      ],
      concepts: ["Props", "State"],
    });
  });

  it("shows as much of a walkthrough as has arrived, without half a closing tag", () => {
    const lesson = parseLesson(`<summary>The heart button.</summary><part><code>const [likes, setLikes]</code>Keeps the co</pa`, undefined, false);

    expect(lesson.summary).toBe("The heart button.");
    expect(lesson.parts).toEqual([{ code: "const [likes, setLikes]", text: "Keeps the co", concept: undefined }]);
  });

  it("copes with a model that forgets to close its parts", () => {
    const lesson = parseLesson(`<summary>S</summary><part><code>a()</code>First<part><code>b()</code>Second`);

    expect(lesson.parts.map((part) => part.text)).toEqual(["First", "Second"]);
  });

  it("drops the related files of a walkthrough saved before they were removed, rather than showing the tags", () => {
    const lesson = parseLesson(FULL);

    expect(lesson.parts).toHaveLength(3);
    expect(lesson.parts.at(-1)?.text).toBe("Adds one like per click.");
    expect(JSON.stringify(lesson)).not.toContain("PostCard");
  });

  it("undoes HTML escaping the model wasn't asked for, including numeric entities", () => {
    const lesson = parseLesson(
      "<summary>S</summary><part><code>const ref = useRef&lt;number | null&gt;(null);</code>a</part>" +
        "<part><code>key={`$&#123;id&#125;-&#x7B;x&#x7D;`}</code>b &amp; c</part>"
    );

    expect(lesson.parts.map((part) => part.code)).toEqual(["const ref = useRef<number | null>(null);", "key={`${id}-{x}`}"]);
    expect(lesson.parts[1].text).toBe("b & c");
  });

  it("treats a body with no walkthrough tags as a one-sentence lesson", () => {
    expect(parseLesson("Inputs a component is handed by the one above it.", "Props")).toEqual({
      summary: "Inputs a component is handed by the one above it.",
      parts: [],
      concepts: ["Props"],
    });
  });
});

describe("a lesson written as a what and a why", () => {
  it("reads the two parts, with the concept that came on its tag", () => {
    const lesson = parseLesson("<what>Adds the task list's memory.</what>\n<why>Without it the list empties on refresh.</why>", "Custom hook");

    expect(lesson).toEqual({
      summary: "Adds the task list's memory.",
      why: "Without it the list empties on refresh.",
      parts: [],
      concepts: ["Custom hook"],
    });
  });

  it("shows as much as has arrived, never half a tag", () => {
    expect(parseLesson("<what>Adds the task li", undefined, false)).toEqual({ summary: "Adds the task li", parts: [], concepts: [] });
    expect(parseLesson("<what>Adds it.</what><why>Without it the li", undefined, false).why).toBe("Without it the li");
    expect(parseLesson("<what>Adds it.</what><wh", undefined, false)).toEqual({ summary: "Adds it.", parts: [], concepts: [] });
  });

  it("copes with a model that forgets to close the first part", () => {
    expect(parseLesson("<what>Adds it.<why>Because the list needs it.</why>")).toMatchObject({
      summary: "Adds it.",
      why: "Because the list needs it.",
    });
  });
});

describe("withoutLeadingConcept", () => {
  it("doesn't repeat the concept's name when the sentence opens with it", () => {
    expect(withoutLeadingConcept("Composition means building a screen.", "Composition", true)).toBe("means building a screen.");
    expect(withoutLeadingConcept("Props: inputs a component is handed.", "Props", true)).toBe("inputs a component is handed.");
    expect(withoutLeadingConcept("Propsy things happen.", "Props", true)).toBe("Propsy things happen.");
  });

  it("holds back a streaming sentence that could still turn out to be the concept's name", () => {
    expect(withoutLeadingConcept("Conditional rend", "Conditional rendering", false)).toBe("");
    expect(withoutLeadingConcept("Choosing", "Conditional rendering", false)).toBe("Choosing");
  });
});

describe("findCodeLine", () => {
  it("finds the line a quote comes from, ignoring indentation and spacing", () => {
    expect(findCodeLine(FILE, "const [likes, setLikes] = useState(initialLikes);")).toBe(4);
    expect(findCodeLine(FILE, "onClick={() =>   setLikes(likes + 1)}")).toBe(6);
  });

  it("searches forward from the previous part, so a repeated line resolves to the right one", () => {
    const file = '<button type="button">A</button>\n<p>between</p>\n<button type="button">B</button>';

    expect(findCodeLine(file, 'type="button"', 1)).toBe(1);
    expect(findCodeLine(file, 'type="button"', 2)).toBe(3);
    expect(findCodeLine(file, "between", 3)).toBe(2);
  });

  it("matches a quote the model shortened with an ellipsis on the part before it", () => {
    expect(findCodeLine(FILE, "export function LikeButton({ initialLikes }...")).toBe(3);
  });

  it("uses the first line of a quote that spans several", () => {
    expect(findCodeLine(FILE, "return (\n    <button")).toBe(5);
  });

  it("gives up cleanly on a quote that isn't in the file", () => {
    expect(findCodeLine(FILE, "useEffect(() => {")).toBeUndefined();
    expect(findCodeLine(undefined, "anything")).toBeUndefined();
  });
});

describe("withLines", () => {
  it("fills in every part's line, walking the file in order", () => {
    expect(withLines(parseLesson(FULL), FILE).parts.map((part) => part.line)).toEqual([3, 4, 6]);
  });
});

describe("parseWalkthrough", () => {
  const TEXT = [
    "A counter button.",
    "",
    "### L3-5 · Keeping the count",
    "The **state** lives here.",
    "",
    "### L7 · Showing it",
    "One line.",
    "",
    "### Worth remembering",
    "State is per component.",
  ].join("\n");

  it("reads an overview, the line-ranged sections in order, and a closing note", () => {
    expect(parseWalkthrough(TEXT, true)).toEqual({
      overview: "A counter button.",
      notes: [
        { startLine: 3, endLine: 5, title: "Keeping the count", text: "The **state** lives here.", isComplete: true },
        { startLine: 7, endLine: 7, title: "Showing it", text: "One line.", isComplete: true },
      ],
      closing: { title: "Worth remembering", text: "State is per component." },
    });
  });

  it("accepts the other dashes and a repeated L in a range, and puts a reversed range the right way round", () => {
    const notes = parseWalkthrough("### L9-L4 - Backwards\nx\n### L2–L3: Dashes\ny", true).notes;

    expect(notes.map((note) => [note.startLine, note.endLine, note.title])).toEqual([[4, 9, "Backwards"], [2, 3, "Dashes"]]);
  });

  it("calls only the last section unfinished while the stream is open", () => {
    const { notes } = parseWalkthrough("Overview.\n### L1 · One\nDone.\n### L2 · Two\nHalf a sen", false);

    expect(notes.map((note) => note.isComplete)).toEqual([true, false]);
    expect(notes[1].text).toBe("Half a sen");
  });

  it("holds back a heading line that is still being written", () => {
    expect(parseWalkthrough("Overview.\n### L1 · One\nDone.\n### L2-", false).notes).toHaveLength(1);
    expect(parseWalkthrough("Overview.\n#", false)).toEqual({ overview: "Overview.", notes: [] });
  });

  it("is only an overview when no section has arrived, and empty for nothing", () => {
    expect(parseWalkthrough("Just the start of an over", false)).toEqual({ overview: "Just the start of an over", notes: [] });
    expect(parseWalkthrough("", false)).toEqual({ overview: "", notes: [] });
  });
});

describe("linesOf", () => {
  const FILE_TEXT = "one\ntwo\nthree\nfour\n";

  it("cuts out a range of lines, counting from one", () => {
    expect(linesOf(FILE_TEXT, 2, 3)).toEqual(["two", "three"]);
    expect(linesOf(FILE_TEXT, 4, 4)).toEqual(["four"]);
  });

  it("stops at the end of the file and gives nothing for a range that is not there", () => {
    expect(linesOf(FILE_TEXT, 3, 40)).toEqual(["three", "four"]);
    expect(linesOf(FILE_TEXT, 9, 12)).toEqual([]);
    expect(linesOf(FILE_TEXT, 0, 2)).toEqual([]);
    expect(linesOf(undefined, 1, 2)).toEqual([]);
  });
});
