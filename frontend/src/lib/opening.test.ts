import { describe, expect, it } from "vitest";
import { beat, coverSide, insideCover, OPENING, ROUND, TILE } from "./opening";

const SCREENS: [number, number][] = [
  [1344, 1020],
  [1920, 1080],
  [1366, 768],
  [390, 844],
  [820, 1180],
  [3440, 1440],
  [1000, 1000],
];

describe("the opening's cover", () => {
  it("hides every corner of the screen", () => {
    for (const [width, height] of SCREENS) {
      const side = coverSide(width, height) + 1;
      for (const x of [-width / 2, width / 2]) {
        for (const y of [-height / 2, height / 2]) expect(insideCover(x, y, side)).toBe(true);
      }
    }
  });

  it("is no larger than it has to be", () => {
    for (const [width, height] of SCREENS) {
      const side = coverSide(width, height) * 0.97;
      expect(insideCover(width / 2, height / 2, side)).toBe(false);
    }
  });

  it("is never narrower than the screen", () => {
    for (const [width, height] of SCREENS) expect(coverSide(width, height)).toBeGreaterThanOrEqual(Math.max(width, height));
  });

  it("rounds its corners, so a point in the square's corner is outside it", () => {
    expect(ROUND).toBeGreaterThan(0);
    expect(insideCover(49, 49, 100)).toBe(false);
    expect(insideCover(49, 0, 100)).toBe(true);
    expect(insideCover(51, 0, 100)).toBe(false);
  });
});

describe("the opening's timetable", () => {
  it("gives Motion a beat in seconds", () => {
    expect(beat({ at: 380, for: 520 })).toEqual({ delay: 0.38, duration: 0.52 });
  });

  it("lets go of the cover before the tile", () => {
    const gone = OPENING.cover.at + OPENING.cover.for * OPENING.coverGone[1];
    expect(OPENING.coverGone[0]).toBeLessThan(OPENING.coverGone[1]);
    expect(OPENING.tile.at + OPENING.tile.for).toBeGreaterThan(gone);
  });

  it("holds back everything that runs on until the copy and the window have landed", () => {
    const copy = OPENING.copy.at + OPENING.copy.step * 4 + OPENING.copy.for;
    const landed = Math.max(copy, OPENING.window.at + OPENING.window.for);
    expect(OPENING.film).toBeGreaterThanOrEqual(landed);
    expect(OPENING.stars).toBeGreaterThanOrEqual(landed);
    expect(OPENING.mark).toBeGreaterThanOrEqual(OPENING.tile.at + OPENING.tile.for);
  });

  it("closes the cover onto a tile that is far smaller than any screen", () => {
    expect(TILE / coverSide(390, 844)).toBeLessThan(0.15);
  });
});
