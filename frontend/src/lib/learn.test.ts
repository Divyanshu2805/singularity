/**
 * Covers the cleaning of a typed word so the same word is the same glossary entry here and on the server, finding a
 * word's entry and filtering the glossary.
 */
import { describe, expect, it } from "vitest";
import { cleanTerm, filterEntries, findEntry, isNotATerm, termKey } from "./learn";

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
