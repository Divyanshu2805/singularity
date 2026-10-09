/**
 * Covers reading a "try changing this" task and the check of it - including while they are still arriving - and the
 * cleaning of a typed word so the same word is the same glossary entry here and on the server.
 */
import { describe, expect, it } from "vitest";
import { cleanTerm, filterEntries, findEntry, isNotATerm, parseTask, parseVerdict, termKey } from "./learn";

const TASK = [
  "Change the heading to your own name.",
  "",
  "### L12-14 · Where to look",
  "The line that holds the words at the top.",
  "",
  "### Done when",
  "The heading no longer says **My notes**.",
].join("\n");

describe("parseTask", () => {
  it("reads what to change, the lines to look at and what counts as done", () => {
    expect(parseTask(TASK, true)).toEqual({
      task: "Change the heading to your own name.",
      startLine: 12,
      endLine: 14,
      where: "The line that holds the words at the top.",
      doneWhen: "The heading no longer says My notes.",
    });
  });

  it("reads a single line, and a range given the other way round", () => {
    expect(parseTask("Do it.\n\n### L7 · Where to look\nHere.", true)).toMatchObject({ startLine: 7, endLine: 7 });
    expect(parseTask("Do it.\n\n### L9-4 · Where to look\nHere.", true)).toMatchObject({ startLine: 4, endLine: 9 });
  });

  it("holds back a heading that is still being written, and shows the opening as it arrives", () => {
    expect(parseTask("Change the head", false)).toEqual({ task: "Change the head" });
    expect(parseTask("Change it.\n\n### L1 · Wh", false)).toEqual({ task: "Change it." });
    expect(parseTask("Change it.\n\n### L1 · Where to look\nThe first line.\n\n### Don", false))
      .toEqual({ task: "Change it.", startLine: 1, endLine: 1, where: "The first line." });
  });

  it("has no line when the model gave none", () => {
    expect(parseTask("Change it.\n\n### Done when\nIt says something else.", true))
      .toEqual({ task: "Change it.", doneWhen: "It says something else." });
  });
});

describe("parseVerdict", () => {
  it("reads Done and Not yet from the first line, with the sentences after it", () => {
    expect(parseVerdict("Done\n\nThe count now starts at 5.", true)).toEqual({ state: "done", detail: "The count now starts at 5." });
    expect(parseVerdict("Not yet\n\nLine 2 still says 0.", true)).toEqual({ state: "notYet", detail: "Line 2 still says 0." });
    expect(parseVerdict("**Done**\nNice.", true).state).toBe("done");
    expect(parseVerdict("  not yet.\nTry again.", true).state).toBe("notYet");
  });

  it("is pending until the first word is known, and decides as soon as it is", () => {
    expect(parseVerdict("", false).state).toBe("pending");
    expect(parseVerdict("No", false).state).toBe("pending");
    expect(parseVerdict("Not", false).state).toBe("pending");
    expect(parseVerdict("Not yet", false).state).toBe("notYet");
    expect(parseVerdict("Done", false).state).toBe("done");
  });

  it("takes an answer that began with neither word as not done, whole", () => {
    expect(parseVerdict("The heading looks changed to me.", true)).toEqual({ state: "notYet", detail: "The heading looks changed to me." });
  });

  it("does not count a later line that says done", () => {
    expect(parseVerdict("Not yet\n\nDone is what it will say when you save.", true).state).toBe("notYet");
  });
});

describe("terms", () => {
  it("cleans a typed word to one short line with no markup", () => {
    expect(cleanTerm("  **Use\n State** `hook` ")).toBe("Use State hook");
    expect(cleanTerm("x".repeat(200))).toHaveLength(80);
    expect(cleanTerm(" ** ")).toBe("");
  });

  it("makes the same word the same key whatever its case or markup", () => {
    expect(termKey("**Props**")).toBe("props");
    expect(termKey("PROPS ")).toBe(termKey("props"));
  });

  it("finds a word's entry by key, and filters a list by what was typed", () => {
    const entries = [{ term: "Props" }, { term: "State" }, { term: "Use effect" }];

    expect(findEntry(entries, "state")).toBe(entries[1]);
    expect(findEntry(entries, "hook")).toBeUndefined();
    expect(findEntry(entries, null)).toBeUndefined();
    expect(findEntry(undefined, "state")).toBeUndefined();
    expect(filterEntries(entries, "use")).toEqual([entries[2]]);
    expect(filterEntries(entries, "  ")).toEqual(entries);
  });

  it("recognises the server's answer for something that is not a word to learn", () => {
    expect(isNotATerm("This isn't a programming word.")).toBe(true);
    expect(isNotATerm("Something a page remembers.")).toBe(false);
  });
});
