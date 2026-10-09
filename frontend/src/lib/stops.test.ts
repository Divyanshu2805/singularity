/**
 * Tests for lib/stops: every stop says what happened to the files and what to do next.
 *
 * Handles: each ending of a reply has its own sentence, a stop the person made wins over the recorded outcome, every
 * sentence that can be retried says so, none of them says "token", and the allowance banner appears only when a
 * build would be refused.
 */
import { describe, expect, it } from "vitest";
import { quotaStop, turnEndNote } from "./stops";
import type { TurnOutcome } from "./types";

describe("turnEndNote", () => {
  it("has a sentence of its own for each ending", () => {
    expect(turnEndNote({ outcome: "STOPPED" })).toContain("You stopped this answer");
    expect(turnEndNote({ wasStopped: true, outcome: "FAILED" })).toContain("You stopped this answer");
    expect(turnEndNote({ notSent: true })).toContain("wasn't sent");
    expect(turnEndNote({ outcome: "OUT_OF_BUDGET" })).toContain("allowance ran out");
    expect(turnEndNote({ outcome: "INCOMPLETE" })).toContain("What was written is saved");
    expect(turnEndNote({ outcome: "NOT_SAVED" })).toContain("your files are as they were");
    expect(turnEndNote({ outcome: "FAILED" })).toContain("nothing was changed");
    expect(turnEndNote({ outcome: "EMPTY" })).toContain("nothing was changed");
  });

  it("names Retry wherever a retry would be accepted, and never says token", () => {
    const outcomes: TurnOutcome[] = ["STOPPED", "INCOMPLETE", "NOT_SAVED", "FAILED", "EMPTY"];

    outcomes.forEach((outcome) => expect(turnEndNote({ outcome })).toContain("Retry"));
    expect(turnEndNote({ outcome: "OUT_OF_BUDGET" })).not.toContain("Retry");
    [...outcomes, "OUT_OF_BUDGET" as TurnOutcome].forEach((outcome) =>
      expect(turnEndNote({ outcome }).toLowerCase()).not.toContain("token")
    );
  });
});

describe("quotaStop", () => {
  it("says nothing while a build would still be admitted", () => {
    expect(quotaStop({ isExhausted: false, canBuild: true }, "2h")).toBeNull();
  });

  it("tells a spent allowance from one that is only too low, and says what still works", () => {
    const spent = quotaStop({ isExhausted: true, canBuild: false }, "2h 5m");
    const low = quotaStop({ isExhausted: false, canBuild: false }, "2h 5m");

    expect(spent?.title).toBe("You've used all of today's AI allowance.");
    expect(low?.title).toBe("There isn't enough of today's AI allowance left for another build.");
    expect(spent?.detail).toContain("It refills in 2h 5m.");
    expect(spent?.detail).toContain("edit your code");
  });
});
