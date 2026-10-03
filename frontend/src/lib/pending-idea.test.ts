/**
 * Tests for the idea carried from the landing page through sign-up.
 *
 * Handles: checking that an idea is handed over once, trimmed and capped, with its mode; that a stale, empty or
 * malformed one is dropped; and that reading always clears it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_AGE_MS, MAX_LENGTH, savePendingIdea, takePendingIdea } from "./pending-idea";

describe("pending idea", () => {
  beforeEach(() => localStorage.clear());

  it("hands the idea over once, with its mode", () => {
    savePendingIdea({ text: "  a reading log for my book club  ", teaching: true }, 1000);
    expect(takePendingIdea(2000)).toEqual({ text: "a reading log for my book club", teaching: true });
    expect(takePendingIdea(2000)).toBeNull();
  });

  it("caps a very long idea", () => {
    savePendingIdea({ text: "x".repeat(MAX_LENGTH + 50), teaching: false }, 0);
    expect(takePendingIdea(1)?.text).toHaveLength(MAX_LENGTH);
  });

  it("drops an idea that has gone stale, and clears it", () => {
    savePendingIdea({ text: "a tip splitter", teaching: false }, 0);
    expect(takePendingIdea(MAX_AGE_MS + 1)).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("drops an idea saved in the future", () => {
    savePendingIdea({ text: "a tip splitter", teaching: false }, 5000);
    expect(takePendingIdea(1000)).toBeNull();
  });

  it("never stores an empty idea and removes an older one instead", () => {
    savePendingIdea({ text: "a recipe box", teaching: false }, 0);
    savePendingIdea({ text: "   ", teaching: false }, 0);
    expect(takePendingIdea(1)).toBeNull();
  });

  it("ignores anything malformed and clears it", () => {
    localStorage.setItem("pending_idea", "{not json");
    expect(takePendingIdea()).toBeNull();
    localStorage.setItem("pending_idea", JSON.stringify({ text: 4, savedAt: 0 }));
    expect(takePendingIdea(1)).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("treats anything but true as Build", () => {
    localStorage.setItem("pending_idea", JSON.stringify({ text: "a planner", teaching: "yes", savedAt: 0 }));
    expect(takePendingIdea(1)).toEqual({ text: "a planner", teaching: false });
  });
});
