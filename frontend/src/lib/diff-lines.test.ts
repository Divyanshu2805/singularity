/**
 * Covers finding where a file's changes start: a change in the middle rather than the top, the first inserted line, a
 * brand-new file, an appended line, the last remaining line when the end was cut off, a clamp when everything was
 * removed, nothing when the versions match, and a change that is only trailing whitespace.
 */
import { describe, it, expect } from "vitest";
import { firstChangedLine } from "./diff-lines";

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
    expect(firstChangedLine("a\nb", "a\nb  ")).toBe(2);
  });

  it("handles files with no trailing newline the same as with one", () => {
    expect(firstChangedLine("a\nb\n", "a\nB\n")).toBe(2);
  });
});
