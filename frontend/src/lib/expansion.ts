/**
 * The arithmetic of zooming a sheet of grid lines in on one of its squares, with a window standing in that square
 * and growing with it: which square it is, how far the zoom has got, the grids that are in view on the way, and how
 * the square lights and the window comes into being.
 *
 * Handles: gridLine - where the grid's lines stand (CELL apart, centred on the sheet), which the sheet that draws
 * them and seedOf both read, so the two cannot drift apart; advance - one step of the progress towards its goal at
 * a fixed pace (GROW_MS for the whole of it), so it is a clock, not a spring, and a late frame cannot throw it;
 * seedOf - the square the zoom closes in on: the cell of the grid under the middle of the window's top edge, the
 * first row that starts at or below that edge, which is the part of the window a laptop shows without scrolling;
 * zoomAt - the zoom at a progress: how far the sheet is magnified (from 1 to `whole`, the number of times the
 * window is wider than the square), the fixed point it is magnified about (given from the window's own top left
 * corner, ready to be a transform origin), and the window's scale and the box it covers. The window starts no wider
 * than the square and centred on it, and it is always the sheet's own magnification that scales it, about the same
 * point, so the window never moves against the sheet: it is something in the square that the view is closing in on.
 * The magnification is geometric - a constant rate of zoom is the only kind that looks like one - on a time curve
 * that starts at once and lands softly (EASE_IN, EASE_OUT), so the window's size on screen grows at a nearly even
 * pace; levelsAt - the grids in view at a magnification. A sheet zoomed thirty times would be left with one square
 * filling the page, so the zoom passes through finer grids as it goes, each fading in while its squares are still
 * small and out once they are large (FADE_IN, FADE_OUT, measured in steps between one grid and the next), the last
 * of them arriving at exactly the grid's resting size - which is how a zoom that ends on the very sheet it began on
 * can still be a zoom; litAt and swellAt - the square's own light and the few pixels it swells by as it pops, both
 * given back as the zoom leaves; presenceAt - how far the window has come into being, whole while it is still
 * small; and beat - the progress of one named part (the pop, the zoom, the sheet round the window fading back).
 *
 * All of it is plain arithmetic with no drawing and no DOM. The sheet that draws with it is
 * components/landing/HeroFabric.tsx, and the window's own side - where it stands, the transform it wears - is
 * components/landing/expansion.ts.
 *
 * Three earlier versions on the same day (2026-10-03): a scroll-linked gathering of the grid's lines onto the
 * window's outline, never shown; an outline that grew from the square with the real window fading in over it; and
 * the real window scaled up from the square over a sheet that stood still, which the owner called fake and slow -
 * a thing that grows over a background that does not move is a pop-up, not a zoom. So the sheet zooms now and the
 * window is carried by it, and it starts with the page instead of waiting for a ripple to arrive.
 */
const GROW_MS = 1250;
const POP_PX = 5;
const SEED_RADIUS = 3;
const SEED_FIT = 1;
const EASE_IN = 1.15;
const EASE_OUT = 2.3;
const PRESENT_BY = 0.23;
const LIT_UNTIL = 0.3;
const SWELL_UNTIL = 0.15;
const TWO_STEPS_FROM = 12;
const FADE_IN = { from: -0.6, to: -0.15 };
const FADE_OUT = { from: 0.45, to: 0.95 };
const SEEN = 0.01;

export const BEATS = {
  pop: { from: 0, to: 0.12 },
  zoom: { from: 0.1, to: 0.94 },
  veil: { from: 0.85, to: 1 },
} as const;

export type Beat = keyof typeof BEATS;
export type Box = { x: number; y: number; w: number; h: number; r: number };
export type Zoom = { magnify: number; whole: number; scale: number; x: number; y: number; box: Box };
export type Level = { scale: number; alpha: number };

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export const gridLine = (size: number, index: number, cell: number) => Math.floor(size / 2 + (index + 0.5) * cell) + 0.5;

export function advance(at: number, goal: number, elapsedMs: number) {
  const most = Math.max(0, elapsedMs) / GROW_MS;
  return at + Math.min(most, Math.max(-most, goal - at));
}

export function beat(progress: number, name: Beat) {
  const { from, to } = BEATS[name];
  return clamp01((progress - from) / (to - from));
}

export function alongAt(progress: number) {
  return 1 - Math.pow(1 - Math.pow(beat(progress, "zoom"), EASE_IN), EASE_OUT);
}

export function seedOf(frame: Box, width: number, height: number, cell: number): Box {
  const column = Math.floor((frame.x + frame.w / 2 - width / 2) / cell - 0.5);
  const row = Math.ceil((frame.y - height / 2) / cell - 0.5);
  const x = gridLine(width, column, cell);
  const y = gridLine(height, row, cell);
  return { x, y, w: gridLine(width, column + 1, cell) - x, h: gridLine(height, row + 1, cell) - y, r: SEED_RADIUS };
}

export function zoomAt(progress: number, seed: Box, frame: Box): Zoom {
  const start = Math.min(1, (seed.w * SEED_FIT) / frame.w);
  const whole = 1 / start;
  const magnify = Math.pow(whole, alongAt(progress));
  const scale = start * magnify;
  const middle = { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 };
  const fixed =
    start < 1
      ? { x: (seed.x + seed.w / 2 - start * middle.x) / (1 - start), y: (seed.y + seed.h / 2 - start * middle.y) / (1 - start) }
      : middle;
  return {
    magnify,
    whole,
    scale,
    x: fixed.x - frame.x,
    y: fixed.y - frame.y,
    box: { x: fixed.x + (frame.x - fixed.x) * scale, y: fixed.y + (frame.y - fixed.y) * scale, w: frame.w * scale, h: frame.h * scale, r: frame.r * scale },
  };
}

export function levelsAt(magnify: number, whole: number): Level[] {
  if (whole <= 1) return [{ scale: 1, alpha: 1 }];
  const steps = whole >= TWO_STEPS_FROM ? 2 : 1;
  const step = Math.pow(whole, 1 / steps);
  const levels: Level[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const scale = magnify / Math.pow(step, index);
    const size = Math.log(scale) / Math.log(step);
    const alpha = smooth((size - FADE_IN.from) / (FADE_IN.to - FADE_IN.from)) * (1 - smooth((size - FADE_OUT.from) / (FADE_OUT.to - FADE_OUT.from)));
    if (alpha > SEEN) levels.push({ scale, alpha });
  }
  return levels;
}

export function litAt(progress: number) {
  return smooth(beat(progress, "pop")) * (1 - smooth(alongAt(progress) / LIT_UNTIL));
}

export function swellAt(progress: number) {
  return POP_PX * smooth(beat(progress, "pop")) * (1 - smooth(alongAt(progress) / SWELL_UNTIL));
}

export function presenceAt(progress: number) {
  return smooth(alongAt(progress) / PRESENT_BY);
}
