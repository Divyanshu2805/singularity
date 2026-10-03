/**
 * Covers the geometry of the sheet of space-time behind the "Continue with Google" button.
 *
 * Handles: the well - nothing at the mass or from the rim on, deepest a third of the way out, and never deep enough
 * at its limit to carry a point past the one beyond it; the rings - still at their source, fading with distance and
 * turned over by half a turn; and the spring - it reaches its goal, overshoots it a little on the way when
 * under-damped, and is not thrown by a frame that arrives late.
 */
import { describe, expect, it } from "vitest";
import { ringAt, sinkAt, sinkLimit, springTowards, type Spring } from "./spacetime";

describe("sinkAt", () => {
  it("draws nothing at the mass itself or from the rim on", () => {
    expect(sinkAt(0, 9, 112)).toBe(0);
    expect(sinkAt(112, 9, 112)).toBe(0);
    expect(sinkAt(300, 9, 112)).toBe(0);
  });

  it("is deepest a third of the way out, by exactly the depth asked for", () => {
    expect(sinkAt(112 / 3, 9, 112)).toBeCloseTo(9, 6);
    expect(sinkAt(20, 9, 112)).toBeLessThan(9);
    expect(sinkAt(60, 9, 112)).toBeLessThan(9);
  });

  it("never carries a point past the one beyond it while the depth is under the limit", () => {
    const reach = 112;
    const depth = sinkLimit(reach) * 0.92;
    let before = 0;
    for (let out = 0.5; out <= reach + 10; out += 0.5) {
      const landed = out - sinkAt(out, depth, reach);
      expect(landed).toBeGreaterThan(before);
      before = landed;
    }
  });

  it("folds the sheet once the depth is over the limit", () => {
    const reach = 112;
    const depth = sinkLimit(reach) * 1.2;
    expect(1 - sinkAt(1, depth, reach)).toBeLessThan(0);
  });
});

describe("ringAt", () => {
  it("leaves the source itself still", () => {
    expect(ringAt(0, 2, 84, 190, 22, 1.3)).toBe(0);
    expect(Math.abs(ringAt(1, 2, 84, 190, 22, 1.3))).toBeLessThan(0.01);
  });

  it("fades with distance", () => {
    const crest = (out: number) => Math.abs(ringAt(out, 2, 84, 190, 22, (out / 84) * Math.PI * 2 - Math.PI / 2));
    expect(crest(84)).toBeGreaterThan(crest(252));
    expect(crest(252)).toBeGreaterThan(crest(420));
  });

  it("turns over with half a turn", () => {
    const now = ringAt(100, 2, 84, 190, 22, 0.7);
    expect(ringAt(100, 2, 84, 190, 22, 0.7 + Math.PI)).toBeCloseTo(-now, 9);
  });
});

describe("springTowards", () => {
  const run = (spring: Spring, goal: number, frames: number, elapsed = 16) => {
    let peak = spring.at;
    for (let frame = 0; frame < frames; frame += 1) {
      springTowards(spring, goal, elapsed, 520, 0.5);
      peak = Math.max(peak, spring.at);
    }
    return peak;
  };

  it("settles on its goal", () => {
    const spring = { at: 0, speed: 0 };
    run(spring, 1, 240);
    expect(spring.at).toBeCloseTo(1, 3);
    expect(Math.abs(spring.speed)).toBeLessThan(0.01);
  });

  it("overshoots a little on the way when under-damped", () => {
    const peak = run({ at: 0, speed: 0 }, 1, 240);
    expect(peak).toBeGreaterThan(1.05);
    expect(peak).toBeLessThan(1.3);
  });

  it("is not thrown by a frame that arrives late", () => {
    const spring = { at: 0, speed: 0 };
    const peak = run(spring, 1, 60, 4000);
    expect(peak).toBeLessThan(1.5);
    expect(spring.at).toBeCloseTo(1, 1);
  });
});
