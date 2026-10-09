/**
 * Tests for lib/guide: which steps the first-run guide shows, that it is remembered, and where its card stands.
 *
 * Handles: a step whose part is not on the page is left out and the order of the rest is kept; the guide is
 * remembered per person; and the card sits below its target, moves above when there is no room below, and is never
 * placed outside the window.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { availableSteps, GUIDE_STEPS, hasSeenGuide, markGuideSeen, placeCard } from "./guide";

describe("availableSteps", () => {
  it("leaves out a step whose part is not on the page and keeps the order of the rest", () => {
    const steps = availableSteps((anchor) => anchor !== "publish" && anchor !== "preview");

    expect(steps.map((step) => step.anchor)).toEqual(["chat", "code", "history"]);
  });

  it("includes publishing once the page has it", () => {
    expect(availableSteps(() => true)).toHaveLength(GUIDE_STEPS.length);
  });
});

describe("hasSeenGuide", () => {
  beforeEach(() => localStorage.clear());

  it("is remembered per person", () => {
    expect(hasSeenGuide(7)).toBe(false);

    markGuideSeen(7);

    expect(hasSeenGuide(7)).toBe(true);
    expect(hasSeenGuide(8)).toBe(false);
  });
});

describe("placeCard", () => {
  const card = { width: 300, height: 150 };
  const viewport = { width: 1200, height: 800 };

  it("sits below its target, centred on it", () => {
    expect(placeCard({ top: 10, left: 500, width: 100, height: 30 }, card, viewport)).toEqual({ top: 52, left: 400, above: false });
  });

  it("moves above when there is no room below", () => {
    const placed = placeCard({ top: 700, left: 500, width: 100, height: 60 }, card, viewport);

    expect(placed.above).toBe(true);
    expect(placed.top).toBe(700 - 12 - 150);
  });

  it("is never placed outside the window", () => {
    expect(placeCard({ top: 10, left: 0, width: 40, height: 30 }, card, viewport).left).toBe(12);
    expect(placeCard({ top: 10, left: 1180, width: 20, height: 30 }, card, viewport).left).toBe(1200 - 12 - 300);
  });
});
