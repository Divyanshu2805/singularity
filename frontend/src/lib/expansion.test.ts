/**
 * Covers the arithmetic of the home page's hero expansion, where the sheet zooms in on one of its squares and the
 * project window, standing in that square, grows with it.
 *
 * Handles: the grid - its lines a cell apart and centred; the clock - it reaches its goal exactly, never passes it,
 * and takes the same time whatever the frame rate; the seed - one whole cell, under the middle of the window's top
 * edge and never above that edge; the zoom - it starts unmagnified with the window no wider than the seed and
 * centred on it, ends with the window at its own size, only ever grows, keeps the window's shape, magnifies about
 * one fixed point, scales the window by exactly the sheet's magnification, and is well under way a third of the way
 * through; the grids in view - one, at rest size, at each end, never none and never more than two on the way, the
 * last of them landing exactly on the resting grid, for a wide window and for a narrow one; the square's light and
 * swell - up with the pop and gone again early in the zoom; the window's presence - nothing before the zoom, whole
 * while it is still small; and the beats - each inside 0 to 1.
 */
import { describe, expect, it } from "vitest";
import { BEATS, advance, alongAt, beat, gridLine, levelsAt, litAt, presenceAt, seedOf, swellAt, zoomAt, type Beat, type Box } from "./expansion";

const CELL = 44;
const FRAME: Box = { x: 60, y: 778, w: 1320, h: 570, r: 16 };
const SEED = seedOf(FRAME, 1440, 1396, CELL);
const during = (share: number) => BEATS.zoom.from + (BEATS.zoom.to - BEATS.zoom.from) * share;

describe("gridLine", () => {
  it("stands a cell apart and is centred on the sheet", () => {
    expect(gridLine(1440, 0, CELL) - gridLine(1440, -1, CELL)).toBe(CELL);
    expect((gridLine(1440, -1, CELL) + gridLine(1440, 0, CELL)) / 2).toBeCloseTo(720.5, 6);
  });
});

describe("advance", () => {
  it("reaches its goal exactly and stays there", () => {
    let at = 0;
    for (let frame = 0; frame < 400; frame += 1) at = advance(at, 1, 16);
    expect(at).toBe(1);
    expect(advance(at, 1, 16)).toBe(1);
  });

  it("takes the same time at any frame rate", () => {
    let slow = 0;
    let fast = 0;
    for (let frame = 0; frame < 30; frame += 1) slow = advance(slow, 1, 32);
    for (let frame = 0; frame < 120; frame += 1) fast = advance(fast, 1, 8);
    expect(slow).toBeCloseTo(fast, 9);
    expect(slow).toBeLessThan(1);
  });

  it("goes back the same way", () => {
    expect(advance(0.5, 0, 16)).toBeLessThan(0.5);
    expect(advance(0.004, 0, 16)).toBe(0);
  });
});

describe("seedOf", () => {
  it("is one whole cell", () => {
    expect(SEED.w).toBe(CELL);
    expect(SEED.h).toBe(CELL);
  });

  it("sits under the middle of the window's top edge, never above it", () => {
    expect(SEED.x).toBeLessThanOrEqual(FRAME.x + FRAME.w / 2);
    expect(SEED.x + SEED.w).toBeGreaterThan(FRAME.x + FRAME.w / 2);
    expect(SEED.y).toBeGreaterThanOrEqual(FRAME.y - 1);
    expect(SEED.y).toBeLessThan(FRAME.y + CELL);
  });

  it("is a cell of the same grid the sheet draws", () => {
    const columns = Array.from({ length: 40 }, (_, index) => gridLine(1440, index - 20, CELL));
    const rows = Array.from({ length: 40 }, (_, index) => gridLine(1396, index - 20, CELL));
    expect(columns).toContain(SEED.x);
    expect(rows).toContain(SEED.y);
  });
});

describe("zoomAt", () => {
  it("starts unmagnified, the window no wider than the seed and centred on it", () => {
    const { box, scale, magnify, whole } = zoomAt(0, SEED, FRAME);
    expect(magnify).toBe(1);
    expect(whole).toBeCloseTo(FRAME.w / SEED.w, 9);
    expect(scale).toBeCloseTo(SEED.w / FRAME.w, 9);
    expect(box.w).toBeCloseTo(SEED.w, 6);
    expect(box.x + box.w / 2).toBeCloseTo(SEED.x + SEED.w / 2, 6);
    expect(box.y + box.h / 2).toBeCloseTo(SEED.y + SEED.h / 2, 6);
  });

  it("ends with the window at its own size", () => {
    for (const progress of [BEATS.zoom.to, 1]) {
      const { box, scale, magnify, whole } = zoomAt(progress, SEED, FRAME);
      expect(magnify).toBeCloseTo(whole, 9);
      expect(scale).toBeCloseTo(1, 9);
      expect(box.x).toBeCloseTo(FRAME.x, 6);
      expect(box.y).toBeCloseTo(FRAME.y, 6);
      expect(box.w).toBeCloseTo(FRAME.w, 6);
      expect(box.h).toBeCloseTo(FRAME.h, 6);
    }
  });

  it("only ever grows, keeps the window's shape, and scales it by the sheet's own magnification", () => {
    let before = 0;
    for (let progress = 0; progress <= 1; progress += 0.01) {
      const { box, scale, magnify, whole } = zoomAt(progress, SEED, FRAME);
      expect(scale).toBeGreaterThanOrEqual(before - 1e-12);
      expect(box.w / box.h).toBeCloseTo(FRAME.w / FRAME.h, 9);
      expect(scale).toBeCloseTo(magnify / whole, 12);
      before = scale;
    }
  });

  it("magnifies about one fixed point", () => {
    const first = zoomAt(during(0.2), SEED, FRAME);
    const later = zoomAt(during(0.7), SEED, FRAME);
    expect(later.x).toBeCloseTo(first.x, 9);
    expect(later.y).toBeCloseTo(first.y, 9);
    for (const { scale, x, y, box } of [first, later]) {
      expect(FRAME.x + x - x * scale).toBeCloseTo(box.x, 6);
      expect(FRAME.y + y - y * scale).toBeCloseTo(box.y, 6);
    }
  });

  it("is well under way a third of the way through, and lands softly", () => {
    expect(zoomAt(during(0.33), SEED, FRAME).scale).toBeGreaterThan(0.15);
    expect(zoomAt(during(0.5), SEED, FRAME).scale).toBeGreaterThan(0.35);
    expect(1 - zoomAt(during(0.95), SEED, FRAME).scale).toBeLessThan(0.02);
  });

  it("is simply the window when the seed is as wide as it", () => {
    const { scale, box, magnify } = zoomAt(during(0.5), { ...FRAME }, FRAME);
    expect(magnify).toBe(1);
    expect(scale).toBe(1);
    expect(box.w).toBe(FRAME.w);
  });
});

describe("levelsAt", () => {
  const cases = [
    { name: "a wide window", whole: 30 },
    { name: "a narrow one", whole: 7.8 },
  ];

  for (const { name, whole } of cases) {
    it(`shows one grid at rest size at each end, for ${name}`, () => {
      expect(levelsAt(1, whole)).toEqual([{ scale: 1, alpha: 1 }]);
      const end = levelsAt(whole, whole);
      expect(end).toHaveLength(1);
      expect(end[0].scale).toBeCloseTo(1, 9);
      expect(end[0].alpha).toBe(1);
    });

    it(`always shows a grid on the way, and never more than two, for ${name}`, () => {
      for (let along = 0; along <= 1; along += 0.01) {
        const levels = levelsAt(Math.pow(whole, along), whole);
        expect(levels.length).toBeGreaterThanOrEqual(1);
        expect(levels.length).toBeLessThanOrEqual(2);
        expect(Math.max(...levels.map((level) => level.alpha))).toBeGreaterThan(0.45);
      }
    });
  }

  it("is the one resting grid when there is nothing to zoom", () => {
    expect(levelsAt(1, 1)).toEqual([{ scale: 1, alpha: 1 }]);
  });
});

describe("the square's light and swell", () => {
  it("come up with the pop and are gone early in the zoom", () => {
    expect(litAt(0)).toBe(0);
    expect(swellAt(0)).toBe(0);
    expect(litAt(BEATS.zoom.from)).toBeGreaterThan(0.5);
    expect(swellAt(BEATS.zoom.from)).toBeGreaterThan(2);
    expect(litAt(during(0.5))).toBe(0);
    expect(swellAt(during(0.5))).toBe(0);
    expect(litAt(1)).toBe(0);
  });
});

describe("presenceAt", () => {
  it("is nothing before the zoom and whole while the window is still small", () => {
    expect(presenceAt(0)).toBe(0);
    expect(presenceAt(BEATS.zoom.from)).toBe(0);
    expect(presenceAt(during(0.25))).toBe(1);
    expect(zoomAt(during(0.25), SEED, FRAME).scale).toBeLessThan(0.2);
    expect(presenceAt(1)).toBe(1);
  });

  it("only ever rises", () => {
    let before = 0;
    for (let progress = 0; progress <= 1; progress += 0.01) {
      expect(presenceAt(progress)).toBeGreaterThanOrEqual(before);
      before = presenceAt(progress);
    }
  });
});

describe("beat and alongAt", () => {
  it("keeps every beat inside 0 to 1 and in step with the progress", () => {
    for (const name of Object.keys(BEATS) as Beat[]) {
      expect(beat(0, name)).toBe(0);
      expect(beat(1, name)).toBe(1);
      expect(beat(0.7, name)).toBeGreaterThanOrEqual(beat(0.6, name));
    }
  });

  it("runs the zoom from nothing to all of it without ever going back", () => {
    expect(alongAt(0)).toBe(0);
    expect(alongAt(1)).toBe(1);
    let before = 0;
    for (let progress = 0; progress <= 1; progress += 0.01) {
      expect(alongAt(progress)).toBeGreaterThanOrEqual(before);
      before = alongAt(progress);
    }
  });
});
