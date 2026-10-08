/**
 * Covers what the chat shows of a person's own message.
 *
 * Handles: the compiled brief being split at its "Build" sentence, messages that only look like one being left alone,
 * and the point at which an ordinary message is folded.
 */
import { describe, it, expect } from "vitest";
import { isLongMessage, splitBrief } from "./brief";

const BRIEF = [
  "**Build:** A single-list todo app with drag-and-drop ordering.",
  "**For:** People who want a simple daily list.",
  "**Screens:**",
  "- Main list: add, tick off, reorder.",
  "**Keep it simple:**",
  "- Due dates.",
].join("\n");

describe("splitBrief", () => {
  it("keeps the sentence that says what is being built and sets the rest aside", () => {
    const brief = splitBrief(BRIEF);

    expect(brief?.headline).toBe("A single-list todo app with drag-and-drop ordering.");
    expect(brief?.rest.startsWith("**For:** People who want")).toBe(true);
    expect(brief?.rest.endsWith("- Due dates.")).toBe(true);
  });

  it("leaves an ordinary message alone, even one that mentions building", () => {
    expect(splitBrief("Build me a todo app")).toBeNull();
    expect(splitBrief("Please add a **Build:** label to the header")).toBeNull();
  });

  it("does not fold a brief that is nothing but its first line", () => {
    expect(splitBrief("**Build:** A todo app.")).toBeNull();
    expect(splitBrief("**Build:** A todo app.\n\n")).toBeNull();
  });
});

describe("isLongMessage", () => {
  it("folds a message by its length or by how many lines it runs to", () => {
    expect(isLongMessage("Add a dark mode toggle")).toBe(false);
    expect(isLongMessage("x".repeat(701))).toBe(true);
    expect(isLongMessage(Array.from({ length: 11 }, (_, line) => `line ${line}`).join("\n"))).toBe(true);
  });
});
