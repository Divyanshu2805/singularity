/**
 * The feature fabric: the features section as one stage - a grid of space-time running to a horizon, a column of
 * gold light standing on it, and in that light a deck of glass cards, one per chapter, each of which comes up from
 * the bottom of the stage to the front as the visitor scrolls and plays its features there.
 *
 * Handles: deciding whether the stage can run at all (a wide, tall enough screen without reduced motion - otherwise
 * the section is FeatureDeck, unchanged); laying the stage out for the screen it has (fabricLayout: how large a card
 * can be, how much floor is left under it, where the horizon and the foot of the light sit); pinning the stage for
 * STEP_SCROLL of a screen per chapter and turning the scroll position into everything that moves - the light coming
 * on and the first card rising as the stage arrives (ENTER), and the shuffle between chapters (SHUFFLE, nearly the
 * whole of each step: the next chapter's card comes up from below the stage to its place in front of the deck, while
 * the cards already up each step one place back), eased so it glides rather than tracks the wheel (FOLLOW_MS);
 * placing each card for where it is (pose); building the floor's mesh once for the screen (weave), painting the light
 * that falls on it whenever that light changes (paintGlow) and drawing the two every frame with the mesh rippling
 * (drawFloor, a perspective grid on a 2D canvas, lit where the light lands and spills
 * towards the visitor); running the front card's demos only once it has settled, and pausing every other card's; the
 * rail above the stage (ChapterRail), which names the five chapters, shows which one is in front and jumps to one
 * when pressed (as does pressing a card that has stepped back); and a hidden list of every feature for screen readers, since the
 * cards themselves are presentation.
 *
 * A card is a chapter: a tab row along its top (number, name, feature count and the chapter's title) and under it
 * the chapter's features side by side - three, or two where one of them is wide - each a tile with its demo above
 * its label (the feature's icon in a small lit tile, its name, its number), title and copy. A card that has stepped back is raised by one tab row per place and a little smaller,
 * so the deck builds up behind the front card as a row of index tabs naming the chapters already seen; BEHIND of
 * them show and the one after that fades out. Chapters not reached yet are still in the fabric, out of sight.
 *
 * A card arrives from where the visitor is: it starts just under the bottom of the stage, the nearest point of the
 * floor, a little larger than it will end up (NEAR), and moves straight up in front of the grid and the light -
 * upright, never turning - easing back to full size as it reaches its place, quicker at first and slowing into it
 * (GLIDE, an ease-out on top of the step's own ease), and it casts a soft shadow on the cards it comes to rest in
 * front of. So the whole deck travels one way, away from the visitor: in from the near edge, to the front, then back
 * a place at a time, smaller and higher - which is why a card in front is never drawn smaller than one behind it. After the last chapter
 * nothing goes back down: the stage unpins and scrolls off with that card standing.
 *
 * The floor is drawn to read as a surface rather than a diagram of one: a dark sheet that hides the sky's stars
 * beneath it, a mesh whose lines thin and fade with distance all the way to the horizon, a shallow dip in it under the
 * light where the deck stands (the lines are traced as curves through that dip, which is what makes it a fabric), and
 * light that falls on it softly - the column's spill towards the visitor with feathered sides, a pool where it lands,
 * and a faint sheen the width of the card, as a polished floor would return it. It fades out at the sides and the
 * bottom, so the stage has no edge.
 *
 * The fabric ripples: rings travel outwards from where the light lands, one every RIPPLE_MS, RIPPLE_SPAN cells apart,
 * lifting and dropping the mesh by a few pixels (RIPPLE) that fade with distance (RIPPLE_REACH), and seen at the
 * floor's grazing angle that reads as depth - the owner asked for a small, smooth ripple that gives the floor a 3D
 * movement, then for a little more of it. The point the light stands on stays still (RIPPLE_CALM). So that this costs
 * almost nothing per frame, weave works out every point of the mesh once - where it sits, and the sine and cosine
 * parts of its swell - and a frame only adds those two parts in the proportions the moment calls for and strokes the
 * lines (trace); the light is painted to a canvas of its own and laid over the mesh, since it changes only while the
 * stage is arriving. The threads that the light whitens are a second, small set of strands under the column only.
 *
 * Only the card in front is frosted glass: a clear, lightly tinted pane over a strong backdrop blur, so the column of
 * light and the cards behind show through it as colour, with a soft wash of light across its upper left as a glass
 * surface has. Its tiles are panes of the same glass and only the demo screens are dark. The type on a card is the
 * page's reading face throughout (titles in a tight semibold sans, as the owner's reference sets them) rather than
 * the serif the rest of the page speaks in - the owner asked for the glass to have a type style of its own. A card is
 * four layers that only ever change opacity: the frosted glass (.holo-glass, with the blur, the wash and the shadows),
 * a thin pane over it that is all a card further back shows (.holo-pane), the tab row and the body. How far a card is
 * to the front sets how much of each shows; a card that has stepped back is the thin pane with its glass and body
 * hidden and its body inert, so the light passes through the deck to the front card and at most two cards ever pay
 * for a backdrop blur. It used to be one element whose fill, blur radius and shadows were computed from a --front
 * custom property, which repainted the whole card on every frame of a shuffle and made the glide stutter (the owner:
 * "the cards don't glide so smoothly"); now a shuffle touches transforms and opacities only and paints nothing. The
 * article itself only moves and must never be faded, and the stage's light and rail are faded directly rather than
 * through a property on the stage, since an ancestor that is faded becomes the backdrop root and leaves the blur
 * nothing to work on, and a custom property on the stage restyles every card under it. Each card is laid out at one
 * design size (CARD_W by CARD_H), fitted to the screen and then held a little under that fit (FIT, at the owner's
 * request - the first cards filled the stage), and enlarged with CSS zoom rather than a transform, so its type stays
 * sharp, and the demos are FeatureDemos' own.
 *
 * The rail is a small pane of the same glass, in the navigation's own language: the chapter names in the reading
 * face, a glass chip outlined in gold that glides to the chapter in front, a fainter pill that follows the pointer
 * and sinks when a name is pressed (the navigation's .nav-active, .nav-hover and .nav-link, placed by motion.ts's
 * placeMarker), and a dot before each name - a ring for a chapter still to come, filled once it has been reached. It
 * comes down into place as the light comes on. It used to be uppercase mono labels over bare progress ticks; the owner
 * asked for glass, motion and a different face there too.
 *
 * This is the sixth stage the owner has seen here. The first had each feature fall to the grid as a small planet,
 * turned down outright in favour of a reference the owner supplied - a glass card floating in a column of gold
 * light over a perspective grid. The second was that reference; the third and fourth made the features the stars of
 * Scorpius, projected as an oval and then a round hologram with an emitter and instrument rings; the fifth went back
 * to one glass card per feature, flipping up out of the grid and folding back into it. The owner then sent the
 * reference again and asked for the chapters back as cards - Build with its three demos, Run with two, and so on, as
 * FeatureDeck has them - shuffling to the front over that glass-and-light background. A first take had the deck full
 * from the start, the front card sinking away so the next could step forward from behind; the owner wanted the
 * opposite - each card coming up from the bottom, out of the fabric, to the front - and the last one left showing as
 * the page scrolls on. A second take swung each card up from flat on the grid, as the fifth stage did; the owner
 * wanted no swing, just the card coming from the bottom to the top and in front. A third had it emerge through the
 * line of light on the floor, masked below that line; the owner said it needn't come out of the fabric - it can come
 * up in front of it - and asked for the arrival to be smoother and more real, which is where the growth, the eased
 * follow and the shadow come from. So the light is back, as smooth layers only (no rays, rings or emitter), the grid
 * is the same one, and the cards rise straight.
 *
 * Everything that moves follows the scroll position, so scrolling back rewinds it, and nothing but the demos and the
 * floor's ripple runs on a clock of its own. The deck doesn't sit exactly on the scroll: its position follows the
 * scroll's as a critically damped spring (FOLLOW_MS is its time constant, stepped exactly for however long the frame
 * took), which has no jump in speed when the wheel starts or stops and settles without a bounce, so the steps
 * of a wheel become one glide; the light reads the scroll directly. A step is STEP_SCROLL of a screen and a shuffle
 * takes nearly all of it (SHUFFLE), eased at both ends, so the scroll between one card being up and the next one
 * starting is the same short rest everywhere - a tenth of a step: after the first card (which finishes rising, ENTER,
 * just as the stage pins, and the steps start at the pin, INTRO_SCROLL) and between every pair of cards. After the
 * last card the stage holds a little longer before letting go (LAST_HOLD, about a seventh of a screen): with the
 * same tenth it slid away the moment that card was up, and the owner asked for it to stay "just a little". It was not
 * always so: the step was shortened several times at the
 * owner's request (0.8, 0.68, 0.56) while a shuffle only took the last four fifths of it, and the first step began a
 * tenth of a screen after the pin, so the second card did not start until more than a quarter of a screen after the
 * first had arrived and every later one waited a fifth of its step - the owner: "after the first feature card arrives
 * I have to scroll a bit more for the next". A card still covers its distance over about the same scroll as before, so
 * a wheel's steps don't show; only the waiting went. The hold after the last card used to keep the stage pinned for
 * most of a step with nothing moving and read as the page stopping. Per-frame values are written straight to the DOM
 * (each card's transform and stacking order, the opacity of its four layers, the light's and the rail's opacity, and
 * the canvas) from one animation-frame loop that runs only while the stage is on screen; a card whose pose hasn't
 * changed is left alone. React re-renders only when the chapter in front changes or its demos start or stop, and then
 * only the cards that changed (ChapterCard is memoised). Pinning relies on position: sticky, so no ancestor may clip
 * with overflow: hidden.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { CHAPTERS, FeatureDeck, type Chapter, type Feature } from "./FeatureDeck";
import { SectionIntro } from "./SectionIntro";
import { DemoPausedContext, glideTo, placeMarker, releaseTilt, tiltToPointer, useInView, usePrefersReducedMotion } from "./motion";

type Phase = { from: number; for: number };
type Layout = { w: number; h: number; k: number; cx: number; top: number; cardW: number; cardH: number; lift: number; horizon: number; base: number; sink: number };
type Floor = { w: number; h: number; cx: number; horizon: number; rise: number; beamHalf: number; cardHalf: number; dpr: number };
type Strand = { points: Float32Array; run: number; width: number; ink: string };
type Mesh = { all: Strand[]; lit: Strand[] };
type Card = { card: HTMLElement; glass: HTMLElement; pane: HTMLElement; tab: HTMLElement; body: HTMLElement; shown: string };
type Scene = { index: number; playing: boolean };

const COUNT = CHAPTERS.length;
const TOTAL = CHAPTERS.reduce((sum, chapter) => sum + chapter.features.length, 0);
const STARTS = CHAPTERS.map((_, index) => CHAPTERS.slice(0, index).reduce((sum, chapter) => sum + chapter.features.length, 0));

const STAGEABLE = "(min-width: 1100px) and (min-height: 660px)";
const STEP_SCROLL = 0.48;
const INTRO_SCROLL = 0;
const LAST_HOLD = 0.3;
const SHUFFLE: Phase = { from: 0.05, for: 0.9 };
const ENTER: Phase = { from: -0.62, for: 0.6 };
const LIGHT: Phase = { from: 0, for: 0.5 };
const FIRST: Phase = { from: 0.3, for: 0.7 };
const SETTLED = 0.06;
const FOLLOW_MS = 125;
const CAUGHT_UP = 0.0004;
const TAB_DIM = 0.55;
const BODY: Phase = { from: 0.1, for: 0.35 };
const RAIL_DROP = 10;

const CARD_W = 1200;
const CARD_H = 426;
const TAB_H = 40;
const SHEET_PAD = 14;
const LIFT = 32;
const BEHIND = 3;
const SHRINK = 0.035;
const NEAR = 1.06;
const GLIDE = 1.5;
const ENTRY = 24;
const APPEAR = 8;
const TILT = 5;
const FIT = 0.9;
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 1.2;
const MAX_WIDTH = 1560;

const RAIL_Y = 88;
const RAIL_BOTTOM = 130;
const RAIL_GAP = 10;
const BEAM = 0.58;
const SPILL = 0.78;
const BEAM_LEAD = 44;
const FLOOR_LEAD = 8;

const CELL = 64;
const ROWS = 6;
const FAR_ROWS = 18;
const FAN = 40;
const WELL = 13;
const WELL_ACROSS = 5;
const WELL_ALONG = 2.4;
const FAR = 0.05;
const DEPTHS = [FAR, 0.3, 0.42, 0.56, 0.72, 0.9, 1.15, 1.5, 2.2, 4];
const RIPPLE = 5;
const RIPPLE_SPAN = 3.4;
const RIPPLE_REACH = 14;
const RIPPLE_CALM = 1.6;
const RIPPLE_MS = 3800;
const UNLIT = 0.004;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const span = (value: number, phase: Phase) => clamp01((value - phase.from) / phase.for);
const smooth = (value: number) => value * value * (3 - 2 * value);
const floorSteep = (rise: number, below: number) => (1 - rise / (below * 1.02)) / ROWS;

function fabricLayout(w: number, h: number): Layout {
  const avail = Math.min(w - 2 * clamp(w * 0.04, 12, 72), MAX_WIDTH);
  const floorRoom = clamp(h * 0.17, 96, 190);
  const deckH = CARD_H + BEHIND * LIFT;
  const k = clamp(Math.min(avail / CARD_W, (h - RAIL_BOTTOM - RAIL_GAP - floorRoom) / deckH) * FIT, MIN_ZOOM, MAX_ZOOM);
  const spare = Math.max(0, h - RAIL_BOTTOM - RAIL_GAP - floorRoom - deckH * k);
  const top = RAIL_BOTTOM + RAIL_GAP + BEHIND * LIFT * k + spare * 0.4;
  const foot = top + CARD_H * k;
  const room = Math.max(40, h - foot);
  const horizon = foot - room * 0.7;
  const base = foot + room * 0.34;
  return { w, h, k, cx: w / 2, top, cardW: CARD_W * k, cardH: CARD_H * k, lift: LIFT * k, horizon, base, sink: base - foot };
}

function weave(floor: Floor): Mesh {
  const { w, h, cx, horizon, rise, beamHalf } = floor;
  const below = h - horizon;
  const steep = floorSteep(rise, below);
  const nearest = (below * 1.04) / rise;
  const rowAt = (scale: number) => (1 - 1 / scale) / steep;
  const scaleAt = (row: number) => 1 / (1 - row * steep);
  const fog = (scale: number) => smooth(clamp01((scale - 0.24) / 0.7));
  const weight = (scale: number) => clamp(0.4 + 0.75 * scale, 0.5, 1.9);
  const across = (scale: number) => Math.min(FAN, Math.ceil(w / (2 * CELL * scale)) + 1);
  const ink = (alpha: number) => `rgba(255, 205, 140, ${alpha.toFixed(3)})`;
  const knot = (line: number, scale: number) => {
    const row = rowAt(scale);
    const dip = WELL * Math.exp(-(line * line) / (2 * WELL_ACROSS * WELL_ACROSS) - (row * row) / (2 * WELL_ALONG * WELL_ALONG));
    const out = Math.hypot(line, row);
    const swell = RIPPLE * scale * Math.exp(-out / RIPPLE_REACH) * ((out * out) / (out * out + RIPPLE_CALM * RIPPLE_CALM));
    const phase = (out / RIPPLE_SPAN) * Math.PI * 2;
    return [cx + line * CELL * scale, horizon + (rise + dip) * scale, swell * Math.sin(phase), swell * Math.cos(phase)];
  };
  const thread = (scale: number, reach: number) => {
    const points: number[] = [];
    for (let line = -reach; line <= reach; line += 0.5) points.push(...knot(line, scale));
    return Float32Array.from(points);
  };
  const warp = (from: number, to: number, reach: number, parts: number) => {
    const points: number[] = [];
    for (let line = -reach; line <= reach; line += 1) {
      for (let part = 0; part <= parts; part += 1) points.push(...knot(line, from + ((to - from) * part) / parts));
    }
    return Float32Array.from(points);
  };

  const all: Strand[] = [];
  const lit: Strand[] = [];
  const lamp = Math.ceil(beamHalf / CELL) + 1;
  for (let row = -FAR_ROWS; row * steep < 1; row += 1) {
    const scale = scaleAt(row);
    if (scale > nearest) break;
    const reach = across(scale);
    all.push({ points: thread(scale, reach), run: reach * 4 + 1, width: weight(scale), ink: ink(0.36 * fog(scale)) });
    if (row >= -1) lit.push({ points: thread(scale, lamp), run: lamp * 4 + 1, width: 1, ink: "" });
  }
  for (let band = 0; band < DEPTHS.length - 1; band += 1) {
    const from = DEPTHS[band];
    const to = Math.min(DEPTHS[band + 1], nearest);
    if (to <= from) break;
    const middle = (from + to) / 2;
    if (0.3 * fog(middle) < UNLIT) continue;
    const parts = Math.max(6, Math.ceil((rowAt(to) - Math.max(rowAt(from), -FAR_ROWS)) * 2));
    all.push({ points: warp(from, to, across(from), parts), run: parts + 1, width: weight(middle), ink: ink(0.3 * fog(middle)) });
  }
  const parts = Math.ceil((rowAt(nearest) + 1) * 2);
  lit.push({ points: warp(scaleAt(-1), nearest, lamp, parts), run: parts + 1, width: 1, ink: "" });
  return { all, lit };
}

function trace(ctx: CanvasRenderingContext2D, strand: Strand, cos: number, sin: number) {
  const { points, run } = strand;
  ctx.beginPath();
  for (let at = 0, knot = 0; at < points.length; at += 4, knot += 1) {
    const y = points[at + 1] + points[at + 2] * cos - points[at + 3] * sin;
    if (knot % run === 0) ctx.moveTo(points[at], y);
    else ctx.lineTo(points[at], y);
  }
  ctx.stroke();
}

function paintGlow(ctx: CanvasRenderingContext2D, floor: Floor, light: number) {
  const { w, h, cx, horizon, rise, beamHalf, cardHalf, dpr } = floor;
  const base = horizon + rise;
  const reach = h - base;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, w, h);
  if (light < UNLIT) return;

  ctx.globalCompositeOperation = "lighter";
  for (let top = base; top < h; top += 3) {
    const scale = (top - horizon) / rise;
    const along = (top - base) / reach;
    const half = beamHalf * scale * 1.3;
    const glow = light * 0.62 * Math.pow(1 - along, 1.9);
    const cool = Math.min(1, along * 3.2);
    const tint = `255, ${Math.round(232 - 92 * cool)}, ${Math.round(200 - 150 * cool)}`;
    const spill = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
    spill.addColorStop(0, `rgba(${tint}, 0)`);
    spill.addColorStop(0.16, `rgba(${tint}, ${(glow * 0.42).toFixed(3)})`);
    spill.addColorStop(0.3, `rgba(${tint}, ${glow.toFixed(3)})`);
    spill.addColorStop(0.7, `rgba(${tint}, ${glow.toFixed(3)})`);
    spill.addColorStop(0.84, `rgba(${tint}, ${(glow * 0.42).toFixed(3)})`);
    spill.addColorStop(1, `rgba(${tint}, 0)`);
    ctx.fillStyle = spill;
    ctx.fillRect(cx - half, top, half * 2, 3);

    const wide = cardHalf * scale * 1.04;
    const sheen = light * 0.075 * Math.pow(1 - along, 2.6);
    const mirror = ctx.createLinearGradient(cx - wide, 0, cx + wide, 0);
    mirror.addColorStop(0, "rgba(255, 198, 130, 0)");
    mirror.addColorStop(0.05, `rgba(255, 198, 130, ${sheen.toFixed(3)})`);
    mirror.addColorStop(0.95, `rgba(255, 198, 130, ${sheen.toFixed(3)})`);
    mirror.addColorStop(1, "rgba(255, 198, 130, 0)");
    ctx.fillStyle = mirror;
    ctx.fillRect(cx - wide, top, wide * 2, 3);
  }

  ctx.save();
  ctx.translate(cx, base + WELL * 0.5);
  ctx.scale(1, 0.15);
  const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, beamHalf * 1.5);
  pool.addColorStop(0, `rgba(255, 244, 224, ${(0.55 * light).toFixed(3)})`);
  pool.addColorStop(0.45, `rgba(255, 176, 90, ${(0.24 * light).toFixed(3)})`);
  pool.addColorStop(1, "rgba(255, 130, 30, 0)");
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.arc(0, 0, beamHalf * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFloor(ctx: CanvasRenderingContext2D, floor: Floor, mesh: Mesh, glow: HTMLCanvasElement, light: number, turn: number) {
  const { w, h, cx, horizon, rise, beamHalf, dpr } = floor;
  const below = h - horizon;
  const base = horizon + rise;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, w, h);

  const sheet = ctx.createLinearGradient(0, horizon, 0, h);
  sheet.addColorStop(0, "rgba(8, 6, 4, 0)");
  sheet.addColorStop(clamp01((rise * 0.45) / below), "rgba(8, 6, 4, 0.7)");
  sheet.addColorStop(1, "rgba(10, 7, 4, 0.92)");
  ctx.fillStyle = sheet;
  ctx.fillRect(0, horizon, w, below);

  for (const strand of mesh.all) {
    ctx.lineWidth = strand.width;
    ctx.strokeStyle = strand.ink;
    trace(ctx, strand, cos, sin);
  }

  if (light >= UNLIT) {
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(glow, 0, 0, w, h);

    const lit = ctx.createLinearGradient(0, base, 0, h);
    lit.addColorStop(0, `rgba(255, 255, 255, ${(0.3 * light).toFixed(3)})`);
    lit.addColorStop(1, "rgba(255, 255, 255, 0)");
    const widen = below / rise;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - beamHalf, base - 2);
    ctx.lineTo(cx + beamHalf, base - 2);
    ctx.lineTo(cx + beamHalf * widen, h);
    ctx.lineTo(cx - beamHalf * widen, h);
    ctx.closePath();
    ctx.clip();
    ctx.lineWidth = 1;
    ctx.strokeStyle = lit;
    for (const strand of mesh.lit) trace(ctx, strand, cos, sin);
    ctx.restore();
  }

  ctx.globalCompositeOperation = "destination-in";
  const away = ctx.createLinearGradient(0, horizon, 0, h);
  away.addColorStop(0, "rgba(0, 0, 0, 1)");
  away.addColorStop(0.8, "rgba(0, 0, 0, 1)");
  away.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = away;
  ctx.fillRect(0, 0, w, h);
  const across = ctx.createLinearGradient(0, 0, w, 0);
  across.addColorStop(0, "rgba(0, 0, 0, 0)");
  across.addColorStop(0.14, "rgba(0, 0, 0, 1)");
  across.addColorStop(0.86, "rgba(0, 0, 0, 1)");
  across.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
}

function partsOf(card: HTMLElement): Card {
  const part = (name: string) => card.querySelector<HTMLElement>(`.holo-${name}`) ?? card;
  return { card, glass: part("glass"), pane: part("pane"), tab: part("tab"), body: part("body"), shown: "" };
}

function pose(deck: Card, place: number, layout: Layout) {
  const { card } = deck;
  const rising = place < 0;
  const open = rising ? clamp01(1 + place) : 1;
  const settle = 1 - Math.pow(1 - open, GLIDE);
  const depth = rising ? 0 : place;
  const scale = rising ? NEAR + (1 - NEAR) * settle : 1 - depth * SHRINK;
  const travel = layout.h - layout.top + layout.cardH * (NEAR - 1) + ENTRY;
  const y = rising ? (1 - settle) * travel : -depth * layout.lift - layout.cardH * (1 - scale);
  const opacity = rising ? clamp01(open * APPEAR) : clamp01(BEHIND + 1 - depth);
  const front = rising ? 1 : clamp01(1 - depth);

  const move = `translate3d(0, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
  const next = `${move}|${opacity.toFixed(3)}|${front.toFixed(3)}`;
  if (deck.shown === next) return;
  deck.shown = next;
  const glass = front > 0 && opacity > 0 ? "on" : "off";
  if (card.dataset.glass !== glass) card.dataset.glass = glass;
  card.style.transform = move;
  card.style.zIndex = String(rising ? 60 : 50 - Math.round(depth * 10));
  card.style.visibility = opacity > 0 ? "visible" : "hidden";
  deck.pane.style.opacity = opacity.toFixed(3);
  deck.glass.style.opacity = (opacity * front).toFixed(3);
  deck.tab.style.opacity = (opacity * (TAB_DIM + (1 - TAB_DIM) * front)).toFixed(3);
  deck.body.style.opacity = (opacity * span(front, BODY)).toFixed(3);
}

function subscribeStageable(notify: () => void) {
  const query = window.matchMedia(STAGEABLE);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

function useStageable() {
  return useSyncExternalStore(
    subscribeStageable,
    () => window.matchMedia(STAGEABLE).matches,
    () => false
  );
}

function Tile({ feature, number }: { feature: Feature; number: number }) {
  return (
    <div
      onPointerMove={(event) => tiltToPointer(event, TILT)}
      onPointerLeave={releaseTilt}
      className={cn("holo-tile", feature.wide && "col-span-2")}
    >
      <div className="holo-screen">{feature.demo}</div>
      <div className="flex flex-1 flex-col px-5 pb-4 pt-3.5">
        <p className="flex items-center gap-2.5 font-mono text-[10.5px] uppercase tracking-[0.2em]">
          <span className="tile-icon">
            <feature.icon className="h-3.5 w-3.5" />
          </span>
          <span className="text-foreground/85">{feature.label}</span>
          <span className="ml-auto tabular-nums text-primary/80">{String(number).padStart(2, "0")}</span>
        </p>
        <h3 className="mt-2.5 text-[18.5px] font-semibold leading-[1.22] tracking-[-0.018em] text-foreground">{feature.title}</h3>
        <p className="mt-1.5 text-[13.5px] leading-[1.58] text-foreground/75">{feature.body}</p>
      </div>
    </div>
  );
}

const ChapterCard = memo(function ChapterCard({ chapter, index, front, playing, zoom, register, onPick }: {
  chapter: Chapter;
  index: number;
  front: boolean;
  playing: boolean;
  zoom: number;
  register: (index: number, node: HTMLElement | null) => void;
  onPick: (index: number) => void;
}) {
  const attach = useCallback((node: HTMLElement | null) => register(index, node), [register, index]);
  return (
    <article ref={attach} aria-hidden="true" className="holo-card" onClick={front ? undefined : () => onPick(index)}>
      <span className="holo-glass" />
      <span className="holo-pane" />
      <div className="holo-sheet" style={{ width: CARD_W, height: CARD_H, padding: `0 ${SHEET_PAD}px ${SHEET_PAD}px`, zoom } as CSSProperties}>
        <header className="holo-tab" style={{ height: TAB_H }}>
          <span className="font-mono text-[11px] tabular-nums tracking-[0.2em] text-primary">0{index + 1}</span>
          <span className="h-px w-5 bg-primary/40" />
          <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-foreground/90">{chapter.name}</span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-muted-foreground/70">· {chapter.features.length} features</span>
          <span className="ml-auto text-[15px] font-medium tracking-[-0.012em] text-foreground/90">{chapter.title}</span>
        </header>
        <div className="holo-body" style={{ height: CARD_H - TAB_H - SHEET_PAD }} {...(front ? {} : { inert: "" })}>
          <DemoPausedContext.Provider value={!playing}>
            {chapter.features.map((feature, order) => (
              <Tile key={feature.label} feature={feature} number={STARTS[index] + order + 1} />
            ))}
          </DemoPausedContext.Provider>
        </div>
      </div>
    </article>
  );
});

function ChapterRail({ index, top, railRef, onPick }: { index: number; top: number; railRef: RefObject<HTMLElement>; onPick: (index: number) => void }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const listRef = useRef<HTMLOListElement>(null);
  const hoverRef = useRef<HTMLSpanElement>(null);
  const activeRef = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  useLayoutEffect(() => placeMarker(activeRef.current, buttons.current[index]), [index]);
  useLayoutEffect(() => placeMarker(hoverRef.current, hovered === null ? null : buttons.current[hovered]), [hovered]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      for (const marker of [activeRef.current, hoverRef.current]) {
        const at = marker?.dataset.for;
        if (marker?.dataset.shown === "true" && at) placeMarker(marker, buttons.current[Number(at)], true);
      }
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  return (
    <nav ref={railRef} aria-label={`${TOTAL} features in ${COUNT} chapters`} className="fab-rail nav-sections" style={{ top }} onPointerLeave={() => setHovered(null)}>
      <span ref={hoverRef} aria-hidden="true" data-for={hovered ?? undefined} className="nav-hover" />
      <span ref={activeRef} aria-hidden="true" data-for={index} className="nav-active" />
      <ol ref={listRef} className="flex items-center gap-0.5">
        {CHAPTERS.map((chapter, order) => (
          <li key={chapter.name}>
            <button
              ref={(node) => {
                buttons.current[order] = node;
              }}
              type="button"
              aria-label={`Chapter ${order + 1} of ${COUNT}: ${chapter.name}`}
              aria-current={order === index ? "true" : undefined}
              data-active={order === index}
              data-state={order === index ? "on" : order < index ? "done" : "idle"}
              onPointerEnter={() => setHovered(order)}
              onFocus={() => setHovered(order)}
              onBlur={() => setHovered(null)}
              onClick={() => onPick(order)}
              className="nav-link fab-chapter relative flex items-center gap-2 rounded-full px-3.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden="true" className="fab-dot" />
              {chapter.name}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Fabric() {
  const [pinRef, visible] = useInView<HTMLDivElement>({ once: false, threshold: 0, rootMargin: "0px" });
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const beamRef = useRef<HTMLSpanElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const cards = useRef<(Card | null)[]>([]);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [scene, setScene] = useState<Scene>({ index: 0, playing: false });
  const shown = useRef(scene);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      setLayout((current) => (current && current.w === w && current.h === h ? current : fabricLayout(w, h)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const pin = pinRef.current;
    if (!layout || !visible || !pin) return;
    const canvas = canvasRef.current;
    const beam = beamRef.current;
    const rail = railRef.current;
    const glow = document.createElement("canvas");
    const ctx = canvas?.getContext("2d") ?? null;
    const lamp = glow.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const floor: Floor = {
      w: layout.w,
      h: layout.h - layout.horizon + FLOOR_LEAD,
      cx: layout.cx,
      horizon: FLOOR_LEAD,
      rise: layout.base - layout.horizon,
      beamHalf: (layout.cardW * BEAM * SPILL) / 2,
      cardHalf: layout.cardW / 2,
      dpr,
    };
    for (const surface of [canvas, glow]) {
      if (!surface) continue;
      surface.width = Math.round(floor.w * dpr);
      surface.height = Math.round(floor.h * dpr);
    }
    const mesh = weave(floor);
    let frame = 0;
    let last = Number.NaN;
    let goal = 0;
    let pos = Number.NaN;
    let speed = 0;
    let then = 0;
    let drawn = "";
    let light = 0;

    const tick = (now: number) => {
      frame = window.requestAnimationFrame(tick);
      const since = -pin.getBoundingClientRect().top;
      if (since !== last) {
        last = since;
        const at = since / layout.h;
        const step = (at - INTRO_SCROLL) / STEP_SCROLL;
        const index = clamp(Math.floor(step), 0, COUNT - 1);
        const enter = span(at, ENTER);
        goal = index + (index < COUNT - 1 ? smooth(span(step - index, SHUFFLE)) : 0) + smooth(span(enter, FIRST)) - 1;
        const power = smooth(span(enter, LIGHT)).toFixed(3);
        if (power !== drawn) {
          drawn = power;
          light = Number(power);
          if (beam) beam.style.opacity = power;
          if (rail) {
            rail.style.opacity = power;
            rail.style.translate = `-50% ${((light - 1) * RAIL_DROP).toFixed(2)}px`;
          }
          if (lamp) paintGlow(lamp, floor, light);
        }
      }
      const elapsed = then ? Math.min(now - then, 64) : 16;
      then = now;
      if (Number.isNaN(pos)) pos = goal;
      else if (pos !== goal || speed !== 0) {
        const lag = pos - goal;
        const pull = speed + lag / FOLLOW_MS;
        const fade = Math.exp(-elapsed / FOLLOW_MS);
        pos = goal + (lag + pull * elapsed) * fade;
        speed = (speed - (pull * elapsed) / FOLLOW_MS) * fade;
        if (Math.abs(pos - goal) < CAUGHT_UP && Math.abs(speed) * FOLLOW_MS < CAUGHT_UP) {
          pos = goal;
          speed = 0;
        }
      }

      cards.current.forEach((card, order) => {
        if (card) pose(card, pos - order, layout);
      });
      if (ctx) drawFloor(ctx, floor, mesh, glow, light, (now / RIPPLE_MS) * Math.PI * 2);

      const near = Math.max(0, Math.round(pos));
      const next: Scene = { index: near, playing: Math.abs(pos - near) < SETTLED };
      const before = shown.current;
      if (before.index !== next.index || before.playing !== next.playing) {
        shown.current = next;
        setScene(next);
      }
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [layout, visible, pinRef]);

  const register = useCallback((index: number, node: HTMLElement | null) => {
    cards.current[index] = node ? partsOf(node) : null;
  }, []);

  const jump = useCallback(
    (index: number) => {
      const pin = pinRef.current;
      if (!pin || !layout) return;
      glideTo(pin.getBoundingClientRect().top + window.scrollY + (INTRO_SCROLL + (index + SHUFFLE.from * 0.35) * STEP_SCROLL) * layout.h);
    },
    [layout, pinRef]
  );

  return (
    <section id="features" className="relative scroll-mt-24 pb-28 pt-6 sm:pb-40 sm:pt-10">
      <div className="landing-wrap">
        <SectionIntro eyebrow="Features" title="Every feature," accent="already doing its job." />
      </div>

      <ul className="sr-only">
        {CHAPTERS.map((chapter) => (
          <li key={chapter.name}>
            <h3>
              {chapter.name}: {chapter.title}
            </h3>
            <ul>
              {chapter.features.map((item) => (
                <li key={item.label}>
                  <h4>
                    {item.label}: {item.title}
                  </h4>
                  <p>{item.body}</p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <div ref={pinRef} className="relative mt-10" style={{ height: `${(1 + INTRO_SCROLL + (COUNT - 1 + LAST_HOLD) * STEP_SCROLL) * 100}vh` }}>
        <div ref={stageRef} className="fab-stage sticky top-0 h-screen overflow-x-clip">
          {layout && (
            <>
              <canvas
                ref={canvasRef}
                aria-hidden="true"
                className="fab-floor"
                style={{ top: layout.horizon - FLOOR_LEAD, height: layout.h - layout.horizon + FLOOR_LEAD }}
              />

              <span
                ref={beamRef}
                aria-hidden="true"
                className="holo-beam"
                style={{
                  left: layout.cx - (layout.cardW * BEAM) / 2,
                  width: layout.cardW * BEAM,
                  top: layout.top - BEHIND * layout.lift - BEAM_LEAD,
                  height: layout.base - layout.top + BEHIND * layout.lift + BEAM_LEAD,
                }}
              />

              <ChapterRail index={scene.index} top={RAIL_Y} railRef={railRef} onPick={jump} />

              <div
                className="holo-deck"
                style={{ left: layout.cx - layout.cardW / 2, top: layout.top, width: layout.cardW, height: layout.cardH }}
              >
                {CHAPTERS.map((chapter, index) => (
                  <ChapterCard
                    key={chapter.name}
                    chapter={chapter}
                    index={index}
                    front={index === scene.index}
                    playing={index === scene.index && scene.playing}
                    zoom={layout.k}
                    register={register}
                    onPick={jump}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function FeatureFabric() {
  const reduced = usePrefersReducedMotion();
  const roomy = useStageable();
  if (reduced || !roomy) return <FeatureDeck />;
  return <Fabric />;
}
