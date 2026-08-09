/**
 * Covers parsing the model's tagged output while it is still arriving: a teaching-mode walkthrough with the file it
 * explains, the concept on a one-sentence lesson, a walkthrough still in flight reported as incomplete, and a delete
 * tag read without its reason ever showing as text.
 *
 * A walkthrough is never typed out character by character - it is folded, so revealing it would only hold back the
 * files after it - and a half-arrived tag is never revealed as text.
 */
import { describe, it, expect } from "vitest";
import { findSafeEnd, findVisibleRanges, parseStreamEvents } from "./use-stream-parser";
import { ChatEventType } from "@/lib/types";

const visibleText = (raw: string) => findVisibleRanges(raw).map(([start, end]) => raw.slice(start, end));

describe("teaching mode walkthroughs in the stream", () => {
  it("parses a walkthrough with the file it explains, its body kept whole", () => {
    const body = '<summary>The app.</summary><part><code><button type="button"></code>A button.</part>';
    const [, lesson] = parseStreamEvents(`<file path="src/App.tsx">x</file><learn path="src/App.tsx">${body}</learn>`);

    expect(lesson).toEqual({
      type: ChatEventType.LEARN,
      content: body,
      filePath: "src/App.tsx",
      metadata: undefined,
      isComplete: true,
    });
  });

  it("still reads the concept on a one-sentence lesson's tag", () => {
    const [, lesson] = parseStreamEvents('<file path="a.tsx">x</file><learn path="a.tsx" concept=" Props ">Props are inputs.</learn>');

    expect(lesson.metadata).toBe("Props");
  });

  it("reports a walkthrough that is still arriving as incomplete", () => {
    const events = parseStreamEvents('<file path="a.tsx">x</file><learn path="a.tsx"><summary>JSX lets you');

    expect(events[1]).toMatchObject({ type: ChatEventType.LEARN, content: "<summary>JSX lets you", isComplete: false });
  });

  it("never types a walkthrough out - it's folded, so that would only hold back the files after it", () => {
    const raw = '<message>Plan.</message><file path="a.tsx">const x = 1;</file><learn path="a.tsx"><summary>A lesson.</summary></learn><learn path="b.tsx">Still wri';

    expect(visibleText(raw)).toEqual(["Plan."]);
  });

  it("never reveals a half-arrived lesson tag as text", () => {
    const raw = "<message>Done.</message><lea";
    expect(findSafeEnd(raw)).toBe(raw.indexOf("<lea"));

    const closing = '<learn path="a.tsx">Props are inputs.</lea';
    expect(findSafeEnd(closing)).toBe(closing.indexOf("</lea"));
  });
});

describe("deleting a file in the stream", () => {
  it("reads a delete tag, and never shows its reason as text", () => {
    const raw = '<message>Renaming.</message><delete path="src/Old.tsx">Replaced by New.tsx</delete>';
    const events = parseStreamEvents(raw);

    expect(events[1]).toMatchObject({ type: ChatEventType.FILE_DELETE, filePath: "src/Old.tsx", isComplete: true });
    const shown = findVisibleRanges(raw).map(([start, end]) => raw.slice(start, end)).join("");
    expect(shown).toBe("Renaming.");
    expect(findSafeEnd("Done <dele")).toBe(5);
  });
});

describe("a file containing a literal closing tag of its own", () => {
  it("is not cut short by an embedded `</file>` with no matching fake opening tag", () => {
    const raw = '<file path="docs/Protocol.md">A generated file always ends with a literal `</file>` tag.</file>'
      + '<message>Done.</message>';

    const events = parseStreamEvents(raw);

    expect(events[0]).toMatchObject({
      type: ChatEventType.FILE_EDIT,
      content: "A generated file always ends with a literal `</file>` tag.",
      isComplete: true,
    });
    expect(events[1]).toMatchObject({ type: ChatEventType.MESSAGE, content: "Done.", isComplete: true });
  });

  it("still reports a still-arriving file as incomplete when no closing tag exists anywhere yet", () => {
    const events = parseStreamEvents('<file path="a.tsx">export const x = 1;\nconst partial');

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ isComplete: false, content: "export const x = 1;\nconst partial" });
  });
});

describe("re-outputting the same file mid-turn", () => {
  it("keeps only the last version, matching what the backend persists", () => {
    const raw = '<file path="src/App.tsx">first draft</file><message>Fixing a typo.</message>'
      + '<file path="src/App.tsx">final version</file>';

    const events = parseStreamEvents(raw);

    const fileEdits = events.filter((event) => event.type === ChatEventType.FILE_EDIT);
    expect(fileEdits).toHaveLength(1);
    expect(fileEdits[0].content).toBe("final version");
    expect(events.map((event) => event.type)).toEqual([ChatEventType.MESSAGE, ChatEventType.FILE_EDIT]);
  });

  it("does not treat two different files as duplicates of each other", () => {
    const events = parseStreamEvents('<file path="a.tsx">a</file><file path="b.tsx">b</file>');

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.filePath)).toEqual(["a.tsx", "b.tsx"]);
  });
});
