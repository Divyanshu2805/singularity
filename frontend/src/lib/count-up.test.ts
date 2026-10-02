/**
 * Tests for the counter's in-between values.
 *
 * Handles: the exact ends, whole numbers throughout, counting down as well as up, and the ease-out shape.
 */
import { describe, expect, it } from "vitest";
import { countUpAt } from "./count-up";

describe("countUpAt", () => {
  it("starts on the old value and lands exactly on the new one", () => {
    expect(countUpAt(3, 120, 0)).toBe(3);
    expect(countUpAt(3, 120, 1)).toBe(120);
    expect(countUpAt(3, 120, 1.4)).toBe(120);
    expect(countUpAt(3, 120, -0.2)).toBe(3);
  });

  it("only ever shows whole numbers", () => {
    for (let step = 0; step <= 20; step++) {
      expect(Number.isInteger(countUpAt(0, 185467, step / 20))).toBe(true);
    }
  });

  it("counts down when the new value is smaller", () => {
    const middle = countUpAt(40, 10, 0.5);
    expect(middle).toBeLessThan(40);
    expect(middle).toBeGreaterThan(10);
  });

  it("covers most of the distance early and settles at the end", () => {
    expect(countUpAt(0, 1000, 0.5)).toBeGreaterThan(800);
  });

  it("never passes the target on the way", () => {
    let previous = 0;
    for (let step = 1; step <= 50; step++) {
      const value = countUpAt(0, 500, step / 50);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThanOrEqual(500);
      previous = value;
    }
  });
});
