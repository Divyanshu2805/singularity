import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { referencedLineField, setReferencedLines } from "./referenced-lines";

const DOC = ["one", "two", "three", "four", "five"].join("\n");

/** The 1-based line numbers currently carrying the highlight. */
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
    // Clicking "lines 2-4" in a code note should highlight the whole block it refers to.
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
    // The range was worked out against the file as it was when the note was written; it may have shrunk since.
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
    // An insert on line 1 pushes the highlighted block down; the decoration maps rather than being lost.
    const edited = highlighted.update({ changes: { from: 0, insert: "new first line\n" } }).state;
    expect(highlightedLines(edited)).toEqual([4, 5]);
  });

  it("provides its decorations to the view", () => {
    // Guards the wiring: a field that never reaches EditorView.decorations highlights nothing on screen,
    // which is invisible to every other test here since they read the field directly.
    const state = EditorState.create({ doc: DOC, extensions: [referencedLineField] });
    expect(state.facet(EditorView.decorations).length).toBeGreaterThan(0);
  });
});
