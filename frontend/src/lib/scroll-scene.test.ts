/**
 * Tests for the landing page's scroll measures.
 *
 * Handles: checking enter, through and leave at the edges of a section's pass through the screen, the remapping of a
 * stretch of progress, and the eases' end points.
 */
import { describe, expect, it } from "vitest";
import { easeInOut, easeOut, measure, mix, span } from "./scroll-scene";

describe("measure", () => {
  it("is at the start of everything while the section is still below the screen", () => {
    const frame = measure({ top: 1200, height: 2000, viewport: 800 });
    expect(frame.enter).toBe(0);
    expect(frame.through).toBe(0);
    expect(frame.leave).toBe(0);
  });

  it("counts entering from the bottom edge to the top edge", () => {
    expect(measure({ top: 800, height: 2000, viewport: 800 }).enter).toBe(0);
    expect(measure({ top: 400, height: 2000, viewport: 800 }).enter).toBe(0.5);
    expect(measure({ top: 0, height: 2000, viewport: 800 }).enter).toBe(1);
  });

  it("counts a pinned section's way through its extra length", () => {
    expect(measure({ top: 0, height: 2000, viewport: 800 }).through).toBe(0);
    expect(measure({ top: -600, height: 2000, viewport: 800 }).through).toBe(0.5);
    expect(measure({ top: -1200, height: 2000, viewport: 800 }).through).toBe(1);
  });

  it("counts leaving once the section's foot passes the bottom edge", () => {
    expect(measure({ top: -1200, height: 2000, viewport: 800 }).leave).toBe(0);
    expect(measure({ top: -1600, height: 2000, viewport: 800 }).leave).toBe(0.5);
    expect(measure({ top: -2000, height: 2000, viewport: 800 }).leave).toBe(1);
  });

  it("never divides by zero for a section no taller than the screen", () => {
    const frame = measure({ top: -100, height: 800, viewport: 800 });
    expect(Number.isFinite(frame.through)).toBe(true);
    expect(frame.through).toBe(1);
  });
});

describe("span", () => {
  it("remaps a stretch onto 0 to 1 and clamps outside it", () => {
    expect(span(0.2, 0.2, 0.6)).toBe(0);
    expect(span(0.4, 0.2, 0.6)).toBeCloseTo(0.5);
    expect(span(0.9, 0.2, 0.6)).toBe(1);
    expect(span(0.1, 0.2, 0.6)).toBe(0);
  });

  it("steps when the stretch has no length", () => {
    expect(span(0.49, 0.5, 0.5)).toBe(0);
    expect(span(0.5, 0.5, 0.5)).toBe(1);
  });
});

describe("eases", () => {
  it("start at 0, end at 1 and stay inside", () => {
    for (const ease of [easeInOut, easeOut]) {
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
      expect(ease(-1)).toBe(0);
      expect(ease(2)).toBe(1);
      expect(ease(0.5)).toBeGreaterThan(0);
      expect(ease(0.5)).toBeLessThan(1);
    }
  });

  it("mixes between two values", () => {
    expect(mix(10, 20, 0)).toBe(10);
    expect(mix(10, 20, 0.5)).toBe(15);
    expect(mix(10, 20, 1)).toBe(20);
  });
});
