/**
 * The arithmetic of the home page's features standing on a sheet of space-time: every card is a weight on the sheet,
 * and everything the sheet and the cards do is read off how far the page has been scrolled.
 *
 * Handles: landing - how far the well under a card has opened for how far the card has risen into place (nothing
 * until LAND_FROM of the way, all of it once the card is home), so the sheet takes the card's weight as the card
 * arrives and gives it back when the page is scrolled up; ringAlong and ringStrength - the one ring a card sends out
 * as it lands, which is not on a clock: how far it has travelled is how far the page has been scrolled past the
 * landing (RING_FROM, over RING_SPAN of the card's rise measure), so it spreads while the visitor scrolls on, stands
 * still when they stop and goes back into the card when they scroll up, coming up quickly as it leaves the card
 * (RING_RISE) and fading as it goes (RING_FADE); focusOf - how lit a chapter is: fully while it spans the line a
 * visitor reads on (READ_LINE of the screen's height), fading as its nearest edge moves away from that line and
 * gone FOCUS_FADE of a screen from it; dimOf - the opacity that focus comes to on the page, which never falls under
 * DIM; leadOf - which chapter's films may play: the most lit one, and the one already leading keeps the lead until
 * another is ahead of it by LEAD_MARGIN, so the lead does not flicker while two chapters share the screen; wellOf -
 * the well a card of a given size presses (its reach, from the card's centre to past its corners, its depth, a little
 * more for a larger card, and the rim its ring leaves from, just inside the card's edge); turnLeft - how long until
 * the film that has been playing since startedAt next reaches its end, which is when the turn passes to the next
 * card; and slabsOf - cutting a tall sheet into equal canvases no taller than a given height.
 *
 * All of it is plain arithmetic with no drawing and no DOM, so the section that uses it
 * (components/landing/feature-motion.ts and FeatureSheet.tsx) only measures and draws. The wells themselves are
 * lib/spacetime.ts's, the same as the hero's and the sign-in page's.
 */
import { sinkLimit } from "./spacetime";

const LAND_FROM = 0.35;
const RING_FROM = 0.78;
const RING_SPAN = 1.3;
const RING_RISE = 0.07;
const RING_FADE = 1.5;
const READ_LINE = 0.5;
const FOCUS_FADE = 0.34;
const DIM = 0.44;
const LEAD_MARGIN = 0.1;
const WELL_REACH = 1.75;
const WELL_DEPTH = 13;
const WELL_AREA = 500 * 480;
const WELL_LEAST = 0.85;
const WELL_MOST = 1.3;
const WELL_HOLD = 0.6;
const WELL_RIM = 0.92;

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const smooth = (value: number) => value * value * (3 - 2 * value);

export function landing(progress: number) {
  return smooth(clamp01((progress - LAND_FROM) / (1 - LAND_FROM)));
}

export function ringAlong(measure: number) {
  return clamp01((measure - RING_FROM) / RING_SPAN);
}

export function ringStrength(along: number) {
  if (along <= 0 || along >= 1) return 0;
  return Math.min(1, along / RING_RISE) * Math.pow(1 - along, RING_FADE);
}

export function focusOf(top: number, bottom: number, viewport: number) {
  if (viewport <= 0) return 1;
  const line = viewport * READ_LINE;
  const away = top > line ? top - line : bottom < line ? line - bottom : 0;
  return 1 - smooth(clamp01(away / (viewport * FOCUS_FADE)));
}

export function dimOf(focus: number) {
  return DIM + (1 - DIM) * clamp01(focus);
}

export function leadOf(current: number, focus: readonly number[]) {
  const holds = current >= 0 && current < focus.length;
  let lead = holds ? current : -1;
  let most = holds ? focus[current] + LEAD_MARGIN : Number.NEGATIVE_INFINITY;
  focus.forEach((level, index) => {
    if (index === current || level <= most) return;
    lead = index;
    most = level;
  });
  return Math.max(0, lead);
}

export function wellOf(width: number, height: number) {
  const reach = WELL_REACH * Math.hypot(width / 2, height / 2);
  const weight = Math.min(WELL_MOST, Math.max(WELL_LEAST, Math.sqrt((width * height) / WELL_AREA)));
  return { reach, depth: Math.min(WELL_DEPTH * weight, sinkLimit(reach) * WELL_HOLD), rim: (Math.min(width, height) / 2) * WELL_RIM };
}

export function turnLeft(loopMs: number, startedAt: number, now: number) {
  if (loopMs <= 0) return 0;
  return loopMs - (Math.max(0, now - startedAt) % loopMs);
}

export function slabsOf(height: number, most: number) {
  const count = Math.max(1, Math.ceil(height / most));
  return { count, each: Math.ceil(height / count) };
}
