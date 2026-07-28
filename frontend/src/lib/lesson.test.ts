/**
 * Covers parsing a teaching-mode walkthrough: its summary and parts, showing as much as has arrived without half a
 * closing tag, coping with parts the model forgot to close, dropping tags a lesson saved in an older shape still
 * carries, undoing HTML escaping nobody asked for, and treating a body with no tags as a one-sentence lesson.
 *
 * Also covers not repeating a concept's name when the sentence already opens with it.
 */
import { describe, it, expect } from "vitest";
import { findCodeLine, parseLesson, withLines, withoutLeadingConcept } from "./lesson";

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
