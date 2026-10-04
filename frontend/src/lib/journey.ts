/**
 * The timeline and the geometry of the new landing page's opening journey: the hero, the app's window rising from
 * behind the planet's horizon, and the five steps of how it works, all on one pinned stage.
 *
 * Handles: where each beat sits on the scroll, measured in screens past the stage's pin - the window rising
 * (MOONRISE), the window docking to the right while the planet sinks away (DOCK), and the five steps, each with its
 * own span - and from a scroll position, which step is playing and how far through it; the two rectangles the window
 * travels between (centred over the eclipse, then docked beside the steps); blending rectangles; and the clip that
 * hides whatever part of the window is still below the limb, as a polygon in the window's own unscaled pixels that
 * follows the limb's curve rather than a straight line.
 *
 * The spans are short on purpose - the owner has found long pinned stretches tiresome on this page before (an orbit
 * that held the page for about seven screens read as the page crawling there) - and something moves on every one:
 * the step beats overlap the window's dock, and the last step runs into a short TAIL in which the camera pulls back -
 * the window and the steps easing away and dimming - before the stage lets go.
 */
export interface Span {
  from: number;
  to: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MOONRISE: Span = { from: 0, to: 0.8 };
export const DOCK: Span = { from: 0.55, to: 1.15 };
export const STEPS_FROM = 1.15;
export const STEP_SPANS = [0.6, 0.6, 0.6, 0.6, 0.75];
export const TAIL = 0.3;
export const STEPS_LENGTH = STEP_SPANS.reduce((sum, span) => sum + span, 0);
export const JOURNEY_SCREENS = STEPS_FROM + STEPS_LENGTH + TAIL;
export const WINDOW_RATIO = 0.64;

const clamp01 = (value: number) => (value <= 0 ? 0 : value >= 1 ? 1 : value);

export function phase(screens: number, { from, to }: Span) {
  return clamp01((screens - from) / (to - from));
}

export function stepAt(screens: number) {
  let rest = screens - STEPS_FROM;
  if (rest <= 0) return { index: 0, fraction: 0, overall: 0, started: false };
  const overall = clamp01(rest / STEPS_LENGTH);
  for (let index = 0; index < STEP_SPANS.length; index++) {
    if (rest < STEP_SPANS[index]) return { index, fraction: rest / STEP_SPANS[index], overall, started: true };
    rest -= STEP_SPANS[index];
  }
  return { index: STEP_SPANS.length - 1, fraction: 1, overall: 1, started: true };
}

export function gutterFor(width: number) {
  return Math.min(72, Math.max(12, width * 0.04));
}

export function windowRects(width: number, height: number) {
  const gutter = gutterFor(width);
  const centredW = Math.min(width * 0.72, 1100, (height - 170) / WINDOW_RATIO);
  const centred: Rect = { x: (width - centredW) / 2, y: 0, w: centredW, h: centredW * WINDOW_RATIO };
  centred.y = Math.max(92, (height - centred.h) / 2 + 26);
  const left = width * 0.43;
  const dockedW = Math.min(width - gutter - left, 900, (height - 150) / WINDOW_RATIO);
  const docked: Rect = { x: width - gutter - dockedW, y: 0, w: dockedW, h: dockedW * WINDOW_RATIO };
  docked.y = Math.max(92, (height - docked.h) / 2 + 26);
  return { centred, docked };
}

export function blendRect(a: Rect, b: Rect, t: number): Rect {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t };
}

export const CLIP_BLEED = 90;

export function limbClip(rect: Rect, base: Rect, limbAt: (x: number) => number, points = 14) {
  const scale = rect.w / base.w;
  const local = (x: number) => (limbAt(rect.x + x * scale) - rect.y) / scale;
  const left = -CLIP_BLEED;
  const right = base.w + CLIP_BLEED;
  let clear = true;
  const edge: string[] = [];
  for (let index = 0; index <= points; index++) {
    const x = right + (left - right) * (index / points);
    const y = Math.min(base.h + CLIP_BLEED, Math.max(-1, local(Math.min(base.w, Math.max(0, x)))));
    if (y < base.h + CLIP_BLEED - 1) clear = false;
    edge.push(`${x.toFixed(1)}px ${y.toFixed(1)}px`);
  }
  if (clear) return "none";
  return `polygon(${left}px ${-CLIP_BLEED}px, ${right.toFixed(1)}px ${-CLIP_BLEED}px, ${edge.join(", ")})`;
}
