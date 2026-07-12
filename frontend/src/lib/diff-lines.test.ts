import { describe, it, expect } from "vitest";
import { firstChangedLine } from "./diff-lines";

/** The line the diff toggle scrolls to: where the file stops matching the version the last turn started from. */
describe("firstChangedLine", () => {
  it("finds a change in the middle rather than the top of the file", () => {
    const before = "one\ntwo\nthree\nfour";
    const after = "one\ntwo\nTHREE\nfour";
    expect(firstChangedLine(before, after)).toBe(3);
  });

  it("points at the first added line when lines are inserted", () => {
    const before = "a\nb\nc";
    const after = "a\nb\nnew\nc";
    expect(firstChangedLine(before, after)).toBe(3);
  });

  it("points at the first line of a new file", () => {
    expect(firstChangedLine("", "const a = 1;\nconst b = 2;")).toBe(1);
  });

  it("points at the appended line when a file only grew", () => {
    expect(firstChangedLine("a\nb", "a\nb\nc")).toBe(3);
  });

  it("points at the last remaining line when the end was cut off", () => {
    // Nothing in the new file differs, so there is no changed line to scroll to - but the merge view draws
    // what was removed just after the last line, which is where the reader needs to be looking.
    expect(firstChangedLine("a\nb\nc\nd", "a\nb")).toBe(2);
  });

  it("clamps to a real line when everything was removed", () => {
    expect(firstChangedLine("a\nb\nc", "")).toBe(1);
  });

  it("says nothing changed when the two versions match", () => {
    expect(firstChangedLine("a\nb\nc", "a\nb\nc")).toBeNull();
    expect(firstChangedLine("", "")).toBeNull();
  });

  it("notices a change that is only trailing whitespace", () => {
    // Whitespace is a real edit here - the merge view paints it, so the scroll has to agree with it.
    expect(firstChangedLine("a\nb", "a\nb  ")).toBe(2);
  });

  it("handles files with no trailing newline the same as with one", () => {
    expect(firstChangedLine("a\nb\n", "a\nB\n")).toBe(2);
  });
});
