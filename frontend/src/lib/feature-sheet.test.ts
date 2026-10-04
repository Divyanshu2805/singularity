/**
 * Covers the arithmetic of the home page's features standing on a sheet of space-time.
 *
 * Handles: the landing - no well until the card is part of the way in, the whole of it once the card is home, and
 * never going back on itself in between; the ring - not sent before the card lands, spent by the end of its travel,
 * strongest just after it leaves and weaker from there on, and reading the same going down the page as coming back
 * up; the focus - full while a chapter spans the reading line, falling as it moves away above or below, and gone
 * a fixed share of a screen from it; the dimming floor; the lead - held until another chapter is clearly ahead; the
 * well a card presses - wide enough to reach past its corners and never deep enough to fold the sheet; the time left
 * in a film's turn; and the cutting of a tall sheet into equal canvases.
 */
import { describe, expect, it } from "vitest";
import { dimOf, focusOf, landing, leadOf, ringAlong, ringStrength, slabsOf, turnLeft, wellOf } from "./feature-sheet";
import { sinkLimit } from "./spacetime";

describe("landing", () => {
  it("opens no well until the card is part of the way in, and all of it once the card is home", () => {
    expect(landing(0)).toBe(0);
    expect(landing(0.3)).toBe(0);
    expect(landing(1)).toBe(1);
    expect(landing(1.4)).toBe(1);
  });

  it("only ever deepens as the card comes in", () => {
    let before = 0;
    for (let progress = 0; progress <= 1; progress += 0.02) {
      const now = landing(progress);
      expect(now).toBeGreaterThanOrEqual(before);
      before = now;
    }
  });
});

describe("the ring", () => {
  it("is not sent before the card lands and is spent by the end of its travel", () => {
    expect(ringStrength(ringAlong(0.5))).toBe(0);
    expect(ringStrength(ringAlong(0.78))).toBe(0);
    expect(ringStrength(ringAlong(5))).toBe(0);
  });

  it("is strongest just after it leaves the card and weaker from there on", () => {
    const early = ringStrength(0.08);
    expect(early).toBeGreaterThan(0.8);
    expect(ringStrength(0.4)).toBeLessThan(early);
    expect(ringStrength(0.8)).toBeLessThan(ringStrength(0.4));
  });

  it("travels further the further the page is scrolled, and reads the same on the way back", () => {
    expect(ringAlong(1.2)).toBeGreaterThan(ringAlong(1));
    expect(ringAlong(1)).toBeGreaterThan(ringAlong(0.9));
    expect(ringAlong(1.2)).toBe(ringAlong(1.2));
  });
});

describe("focusOf", () => {
  const screen = 900;

  it("is full while the chapter spans the reading line", () => {
    expect(focusOf(100, 700, screen)).toBe(1);
    expect(focusOf(450, 1100, screen)).toBe(1);
    expect(focusOf(-300, 450, screen)).toBe(1);
  });

  it("falls as the chapter moves away, below or above, and is gone a fixed share of a screen off", () => {
    expect(focusOf(600, 1200, screen)).toBeLessThan(1);
    expect(focusOf(700, 1300, screen)).toBeLessThan(focusOf(600, 1200, screen));
    expect(focusOf(-500, 300, screen)).toBeLessThan(1);
    expect(focusOf(800, 1400, screen)).toBe(0);
    expect(focusOf(-700, 100, screen)).toBe(0);
  });
});

describe("dimOf", () => {
  it("never dims a chapter away altogether", () => {
    expect(dimOf(1)).toBe(1);
    expect(dimOf(0)).toBeGreaterThan(0.3);
    expect(dimOf(-2)).toBe(dimOf(0));
  });
});

describe("leadOf", () => {
  it("gives the lead to the most lit chapter when none holds it", () => {
    expect(leadOf(-1, [0.1, 0.9, 0.4])).toBe(1);
    expect(leadOf(-1, [])).toBe(0);
  });

  it("keeps the lead until another chapter is clearly ahead", () => {
    expect(leadOf(0, [0.8, 0.85, 0])).toBe(0);
    expect(leadOf(0, [0.6, 0.95, 0])).toBe(1);
    expect(leadOf(2, [0, 0.5, 0.5])).toBe(2);
  });
});

describe("wellOf", () => {
  it("reaches past the card's corners and leaves its ring from just inside the edge", () => {
    const well = wellOf(500, 480);
    expect(well.reach).toBeGreaterThan(Math.hypot(250, 240));
    expect(well.rim).toBeLessThan(240);
    expect(well.rim).toBeGreaterThan(200);
  });

  it("presses a little deeper for a larger card and never deep enough to fold the sheet", () => {
    const small = wellOf(420, 440);
    const wide = wellOf(1020, 480);
    expect(wide.depth).toBeGreaterThan(small.depth);
    expect(wide.depth).toBeLessThan(sinkLimit(wide.reach));
    expect(wellOf(60, 60).depth).toBeLessThan(sinkLimit(wellOf(60, 60).reach));
  });
});

describe("turnLeft", () => {
  it("is the whole film when it has only just started", () => {
    expect(turnLeft(10000, 500, 500)).toBe(10000);
  });

  it("counts down to the film's end, and to its next end once it has looped", () => {
    expect(turnLeft(10000, 0, 2500)).toBe(7500);
    expect(turnLeft(10000, 0, 23000)).toBe(7000);
  });
});

describe("slabsOf", () => {
  it("cuts a tall sheet into equal canvases no taller than asked", () => {
    const { count, each } = slabsOf(3300, 720);
    expect(count).toBe(5);
    expect(each).toBeLessThanOrEqual(720);
    expect(count * each).toBeGreaterThanOrEqual(3300);
  });

  it("leaves a short sheet whole", () => {
    expect(slabsOf(400, 720)).toEqual({ count: 1, each: 400 });
  });
});
