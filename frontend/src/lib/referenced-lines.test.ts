/**
 * Covers the editor's "look here" highlight: every line of a range lit rather than just the first, a single line as a
 * one-line range, clearing it, clamping a range that runs past the end of the file, highlighting nothing when it
 * starts past the end, a backwards range, and the highlight moving with the text after an edit above it.
 */
import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { referencedLineField, setReferencedLines } from "./referenced-lines";

const DOC = ["one", "two", "three", "four", "five"].join("\n");

function highlightedLines(state: EditorState): number[] {
  const decorations = state.field(referencedLineField);
  const lines: number[] = [];
  decorations.between(0, state.doc.length, (from) => {
    lines.push(state.doc.lineAt(from).number);
  });
  return lines;
}

function applyRange(range: { from: number; to: number } | null, doc = DOC) {
  const state = EditorState.create({ doc, extensions: [referencedLineField] });
  return state.update({ effects: setReferencedLines.of(range) }).state;
}

describe("referenced line highlight", () => {
  it("lights up every line of a range, not just the first", () => {
    expect(highlightedLines(applyRange({ from: 2, to: 4 }))).toEqual([2, 3, 4]);
  });

  it("handles a single line as a one-line range", () => {
    expect(highlightedLines(applyRange({ from: 3, to: 3 }))).toEqual([3]);
  });

  it("clears the highlight when passed null", () => {
    const highlighted = applyRange({ from: 1, to: 3 });
    const cleared = highlighted.update({ effects: setReferencedLines.of(null) }).state;
    expect(highlightedLines(cleared)).toEqual([]);
  });

  it("clamps a range that runs past the end of the file", () => {
    expect(highlightedLines(applyRange({ from: 4, to: 99 }))).toEqual([4, 5]);
  });

  it("highlights nothing when the range starts past the end of the file", () => {
    expect(highlightedLines(applyRange({ from: 99, to: 120 }))).toEqual([]);
  });

  it("treats a backwards range as starting where it says", () => {
    expect(highlightedLines(applyRange({ from: 3, to: 1 }))).toEqual([3]);
  });

  it("survives an edit above it by moving with the text", () => {
    const highlighted = applyRange({ from: 3, to: 4 });
    const edited = highlighted.update({ changes: { from: 0, insert: "new first line\n" } }).state;
    expect(highlightedLines(edited)).toEqual([4, 5]);
  });

  it("provides its decorations to the view", () => {
    const state = EditorState.create({ doc: DOC, extensions: [referencedLineField] });
    expect(state.facet(EditorView.decorations).length).toBeGreaterThan(0);
  });
});
