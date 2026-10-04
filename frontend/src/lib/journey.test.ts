/**
 * Tests for the landing page's opening journey: its beats, its steps and the window's geometry.
 *
 * Handles: checking where the steps start and end on the scroll, that every beat stays within the stage, that the
 * window's two rectangles fit the screen and keep the window's shape, and that the limb's clip hides what is below the
 * horizon and is dropped once nothing is.
 */
import { describe, expect, it } from "vitest";
import {
  CLIP_BLEED,
  DOCK,
  JOURNEY_SCREENS,
  MOONRISE,
  STEP_SPANS,
  STEPS_FROM,
  WINDOW_RATIO,
  blendRect,
  limbClip,
  phase,
  stepAt,
  windowRects,
} from "./journey";

describe("journey beats", () => {
  it("fit inside the pinned stage, in order", () => {
    expect(MOONRISE.from).toBe(0);
    expect(DOCK.from).toBeLessThan(MOONRISE.to);
    expect(DOCK.to).toBeLessThanOrEqual(STEPS_FROM);
    expect(STEPS_FROM + STEP_SPANS.reduce((a, b) => a + b, 0)).toBeLessThan(JOURNEY_SCREENS);
  });

  it("clamps a phase to 0..1", () => {
    expect(phase(-1, MOONRISE)).toBe(0);
    expect(phase(MOONRISE.to / 2, MOONRISE)).toBeCloseTo(0.5);
    expect(phase(5, MOONRISE)).toBe(1);
  });
});

describe("stepAt", () => {
  it("waits at the first step until the steps start", () => {
    expect(stepAt(0)).toEqual({ index: 0, fraction: 0, overall: 0, started: false });
  });

  it("walks through each step's own span", () => {
    const first = stepAt(STEPS_FROM + STEP_SPANS[0] / 2);
    expect(first.index).toBe(0);
    expect(first.fraction).toBeCloseTo(0.5);
    expect(stepAt(STEPS_FROM + STEP_SPANS[0] + 0.0001).index).toBe(1);
    const last = STEPS_FROM + STEP_SPANS.slice(0, 4).reduce((a, b) => a + b, 0) + STEP_SPANS[4] / 2;
    expect(stepAt(last).index).toBe(4);
    expect(stepAt(last).fraction).toBeCloseTo(0.5);
  });

  it("holds the last step finished past the end", () => {
    expect(stepAt(JOURNEY_SCREENS + 3)).toMatchObject({ index: 4, fraction: 1, overall: 1 });
  });
});

describe("windowRects", () => {
  it("keeps the window's shape and fits it on a laptop screen", () => {
    const { centred, docked } = windowRects(1440, 860);
    for (const rect of [centred, docked]) {
      expect(rect.h / rect.w).toBeCloseTo(WINDOW_RATIO);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(1440);
      expect(rect.y + rect.h).toBeLessThanOrEqual(860);
    }
    expect(docked.x).toBeGreaterThan(centred.x);
    expect(docked.w).toBeLessThan(centred.w);
  });

  it("blends between two rectangles", () => {
    const a = { x: 0, y: 0, w: 100, h: 50 };
    const b = { x: 100, y: 20, w: 200, h: 150 };
    expect(blendRect(a, b, 0)).toEqual(a);
    expect(blendRect(a, b, 1)).toEqual(b);
    expect(blendRect(a, b, 0.5)).toEqual({ x: 50, y: 10, w: 150, h: 100 });
  });
});

describe("limbClip", () => {
  const base = { x: 0, y: 0, w: 1000, h: 640 };

  it("is dropped once the limb is well below the window", () => {
    expect(limbClip({ ...base, y: 0 }, base, () => 640 + CLIP_BLEED + 50)).toBe("none");
  });

  it("cuts the window along the limb while it is still behind it", () => {
    const clip = limbClip({ ...base, y: 300 }, base, () => 500);
    expect(clip.startsWith("polygon(")).toBe(true);
    expect(clip).toContain("px 200.0px");
  });

  it("follows the window's scale", () => {
    const clip = limbClip({ x: 0, y: 100, w: 500, h: 320 }, base, () => 200);
    expect(clip).toContain("px 200.0px");
  });
});
