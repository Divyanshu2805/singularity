/**
 * The sheet of space-time the home page's hero stands on: a faint grid behind the headline and the prompt, bent by
 * the prompt, which is the mass resting on it - the idea is the singularity - and carrying each idea out to the
 * project window as one ripple. Given the project window (frame), the sheet also brings the window in: on a load it
 * zooms in on one of its own squares, and the window, standing in that square, grows with it to its full size.
 *
 * Handles: the grid, drawn on one canvas (CELL apart, both line directions, and BEYOND the canvas on every side so
 * there is always more sheet to be drawn into view); the dip round the prompt (DIP - the lines gather towards the
 * middle of the prompt's box and come up a shade gold round it), which opens on a spring once the prompt has arrived
 * (armed), so it reads as the sheet taking a weight; the ripples (pulse, called by the hero) - a single soft ring
 * that leaves the prompt and travels outwards at PULSE_SPEED, pushing the lines out as it passes and lighting them
 * gold, fading with distance until it is gone at PULSE_REACH; the pointer, which is a second, smaller mass - the
 * sheet sinks towards it and the lines round it come up gold, trailing it by a breath and opening and closing on a
 * spring - for a mouse only; a few stars lying on the sheet out towards its sides, which are carried by it
 * further than the lines are, so they lean towards the prompt and bob as a ripple passes; the two bodies of the
 * logo's eclipse (mark), which are masses on the sheet as well; and the expansion.
 *
 * The logo's bodies (the owner: "add the curvature on fabric when planets move on it as well in logo animation").
 * Over the headline the mark plays as an eclipse (EclipseMark): a sun stands at its core and a moon crosses it. Given
 * the mark's element, the sheet holds a small steady dip under the core (CORE) for as long as the mark is lit, and a
 * deeper one under the moon (MOON) that is read off the moon's own disc on every frame (HorizonMark's .hz-moon, whose
 * crossing the stylesheet owns), so the curve travels across the sheet with the moon, is deepest at totality, where
 * the two dips lie on each other, and moves on and closes as the moon leaves. Both open and close on a spring
 * (BODY_MS) and bring the lines round them up a shade gold, as the pointer's well does. The moon's dip stays where
 * the moon was last seen while it is hidden, since the disc is put back at its start, unseen, between passes. Under
 * reduced motion, where there is no eclipse, the still frame has the core's dip alone.
 *
 * The expansion (the owner: "I want this animation to pop up and expand from a square of a fabric when the page is
 * loaded", then "realistic ... from small to large expanding in size and look like as if we are zooming in but not
 * actually zooming in", both said of the project window). With a frame, the canvas reaches the foot of the hero
 * instead of stopping short of the window (home.css, .hero-fabric[data-frame], which also keeps the sheet round the
 * window in view until the window has arrived). The square is the cell of the grid under the middle of the window's
 * top edge (lib/expansion.ts, seedOf), taken where the dip has carried it and held there, as the anchor, from the
 * moment the growth starts. Once the hero says to (grow), the progress runs on a clock (advance): the square lights
 * (components/landing/expansion.ts's drawSeed) and then the whole sheet is magnified about a point in that square
 * (zoomAt) - every line of the grid moves out from it, the nearer ones slowly and the far ones fast, as they would
 * if the view were diving at the square. The window is that square's content: the hero is handed the same
 * magnification on every change (onExpand) and puts it on the window, so the window and the sheet never move
 * against each other, which is the whole of what makes it read as a zoom and not as a box growing on a page. A
 * sheet magnified that far would be one square wide, so finer grids come into view as it goes, each fading in
 * while its squares are small and out once they are large (levelsAt), the last arriving at exactly the resting
 * grid - the page ends on the sheet it began on. The dip, the ripples and the logo's bodies are laid on after the
 * magnification, since they belong to things that do not move. The sheet's stars are carried out with the first
 * grid and come back with the last. Nothing on the page is scaled but the sheet's lines and the window: the copy
 * and the far stars stand still, and it is against them that the zoom is seen. As the window arrives the sheet
 * round it fades back, so the page at rest is the one it was before. Where the progress starts from is the hero's
 * to say (the handle's expansion, which sets it outright): the window is a later sibling of this canvas, so it does
 * not exist yet when this component's own layout effects run. When the sheet comes back on screen after being
 * scrolled away part-way through, the progress is put straight at its goal, so nobody returns to a window half
 * grown. Where the window stands is re-read every MEASURE_MS while the growth is under way, since the copy above
 * it can still be settling. A ripple can be asked for from inside a frame, when the clock reads later than that
 * frame's own time, so a ripple's front is never taken as behind its source - a negative one made its gradient
 * throw.
 *
 * Three earlier versions on the same day: grid lines gathering onto the window's outline with the scroll (never
 * shown); an outline growing from the square with the window fading in over it; and the window scaled up from the
 * square over a sheet that stood still, set off by a ripple from the prompt - which the owner called fake and slow.
 *
 * This is the sign-in page's fabric (components/auth/SpacetimeFabric.tsx, which the owner called perfect) at the
 * scale of a page, with the same geometry (lib/spacetime.ts) and the same rule that the sheet is seen from straight
 * above, as a flat grid with both sets of lines. Two things differ. Its rings there spread all the time; here the
 * sheet is still until an idea is sent, because a ripple here means something - it is the idea going out - and a
 * page-sized sheet that never rested would compete with the headline. And the mass here is a wide box rather than a
 * small mark, so nothing has to be cleared round it: the prompt's own card covers the middle of the dip.
 *
 * The canvas takes no pointer events; it listens on the section it sits in, and ignores the pointer while it is over
 * a formed window, where the sheet cannot be seen. Where the prompt is is read on every frame, since the copy above
 * it reflows with the width and rises in on load. The loop runs only while the canvas is on screen, and while nothing
 * is moving it redraws only often enough for the stars to twinkle (IDLE_FRAME_MS); a frame allocates one path and a
 * gradient per ripple. The canvas is drawn at no more than 1.5 device pixels per CSS pixel, and its edges are faded
 * by a mask (home.css, .hero-fabric), so the grid has no border. The sheet's own stars keep to the height the sheet
 * had before it reached the window (SKY). Under reduced motion one still frame is drawn - the dip open, the stars
 * half lit - no ripple is ever sent and nothing grows: the window simply stands there.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, type RefObject } from "react";
import { sinkAt, sinkLimit, springTowards, type Spring } from "@/lib/spacetime";
import { advance, beat, gridLine, levelsAt, smooth, zoomAt, type Box, type Level, type Zoom } from "@/lib/expansion";
import { cn } from "@/lib/utils";
import { useInView, usePrefersReducedMotion } from "./motion";
import { drawSeed, measureSite, type Site } from "./expansion";

export const PULSE_SPEED = 320;

const CELL = 44;
const STEP = 11;
const BEYOND = 66;
const LINE = 0.075;
const RATIO = 1.5;
const IDLE_FRAME_MS = 150;
const SKY = 960;

const DIP = 18;
const DIP_REACH = 440;
const DIP_LIT = 0.12;
const DIP_GLOW = 340;
const DIP_MS = 1250;
const DIP_DAMPING = 0.6;

const WELL = 11;
const WELL_REACH = 180;
const WELL_LIT = 0.15;
const WELL_GLOW = 140;
const WELL_MS = 560;
const WELL_DAMPING = 0.5;
const FOLLOW_MS = 95;

const PULSE = 10;
const PULSE_BAND = 62;
const PULSE_REACH = 820;
const PULSE_LIT = 0.34;

const MEASURE_MS = 320;
const MOST_LINES = 420;
const STAR_GONE = 3;
const STAR_BACK = 0.55;

const CORE = 6;
const CORE_REACH = 150;
const CORE_AT = 22 / 36;
const MOON = 12;
const MOON_REACH = 170;
const BODY_LIT = 0.13;
const BODY_GLOW = 150;
const BODY_MS = 700;
const BODY_DAMPING = 0.62;
const BODY_STEP = 0.05;
const MARK = ".hz-mark";
const MOON_DISC = ".hz-moon";

const STAR_CARRY = 1.7;
const STAR_DIM = 0.18;
const STAR_REST = 0.62;
const STAR_CORE = "hsl(46 100% 90%)";
const STAR_HALO = "hsl(40 100% 62%)";
const STARS = [
  [0.07, 0.2, 1.2, 0.4, 6.5],
  [0.13, 0.52, 0.9, 2.2, 8],
  [0.19, 0.33, 1, 3.6, 7],
  [0.25, 0.64, 0.8, 1.9, 9],
  [0.3, 0.16, 0.9, 4.4, 7.5],
  [0.34, 0.47, 0.7, 0.9, 6],
  [0.66, 0.5, 0.8, 1.2, 7.5],
  [0.7, 0.18, 1, 3.1, 8.5],
  [0.76, 0.62, 0.9, 4.1, 9],
  [0.81, 0.3, 1.2, 0.6, 6],
  [0.88, 0.55, 0.8, 2.9, 8],
  [0.93, 0.24, 1, 1.6, 7],
];

type Point = { x: number; y: number };
type Pulse = { born: number; strength: number };
type Body = { at: Point; lift: Spring; depth: number; reach: number };
type Sheet = { mass: Point | null; well: Point; lift: Spring; dip: Spring; pulses: Pulse[]; grown: number; site: Site | null; anchor?: Box | null; lived?: Box | null; bodies?: Body[] };

const NO_BODIES: Body[] = [];

export interface FabricHandle {
  pulse: (strength?: number) => void;
  expansion: (progress: number) => void;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const fadeOf = (front: number) => Math.pow(clamp01(1 - front / PULSE_REACH), 1.6);
const veilOf = (progress: number) => (1 - smooth(beat(progress, "veil"))).toFixed(3);

const REST: Level[] = [{ scale: 1, alpha: 1 }];

function paint(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, sheet: Sheet, now: number, age: number | null) {
  const { mass, well } = sheet;
  const dip = Math.min(DIP * sheet.dip.at, sinkLimit(DIP_REACH) * 0.92);
  const depth = Math.min(WELL * sheet.lift.at, sinkLimit(WELL_REACH) * 0.92);
  const lit = clamp01(sheet.lift.at);
  const rings = sheet.pulses.map((pulse) => {
    const front = Math.max(0, ((now - pulse.born) / 1000) * PULSE_SPEED);
    return { front, size: PULSE * pulse.strength * fadeOf(front), light: PULSE_LIT * pulse.strength * fadeOf(front) };
  });
  const bodies = sheet.bodies ?? NO_BODIES;
  const site = sheet.site && sheet.grown < 1 ? sheet.site : null;
  let px = 0;
  let py = 0;
  const sway = (x: number, y: number, carry: number) => {
    let sx = 0;
    let sy = 0;
    if (mass) {
      const dx = mass.x - x;
      const dy = mass.y - y;
      const out = Math.hypot(dx, dy);
      if (out > 0.5) {
        let draw = sinkAt(out, dip, DIP_REACH);
        for (const ring of rings) {
          const off = (out - ring.front) / PULSE_BAND;
          if (off > -3 && off < 3) draw -= ring.size * Math.exp(-off * off);
        }
        sx += (dx / out) * draw;
        sy += (dy / out) * draw;
      }
    }
    if (depth !== 0) {
      const dx = well.x - x;
      const dy = well.y - y;
      const out = Math.hypot(dx, dy);
      if (out > 0.5) {
        const draw = sinkAt(out, depth, WELL_REACH);
        sx += (dx / out) * draw;
        sy += (dy / out) * draw;
      }
    }
    for (const body of bodies) {
      if (body.lift.at === 0) continue;
      const dx = body.at.x - x;
      const dy = body.at.y - y;
      const out = Math.hypot(dx, dy);
      if (out > 0.5 && out < body.reach) {
        const draw = sinkAt(out, Math.min(body.depth * body.lift.at, sinkLimit(body.reach) * 0.92), body.reach);
        sx += (dx / out) * draw;
        sy += (dy / out) * draw;
      }
    }
    px = x + sx * carry;
    py = y + sy * carry;
  };

  let lived: Box | null = null;
  if (site) {
    const { seed } = site;
    sway(seed.x, seed.y, 1);
    const left = px;
    const top = py;
    sway(seed.x + seed.w, seed.y + seed.h, 1);
    lived = { x: left, y: top, w: px - left, h: py - top, r: seed.r };
  }
  sheet.lived = lived;
  const anchor = site && sheet.grown > 0 ? (sheet.anchor ?? lived) : null;
  const zoom = site && anchor ? zoomAt(sheet.grown, anchor, site.frame) : null;
  const fx = site && zoom ? site.frame.x + zoom.x : 0;
  const fy = site && zoom ? site.frame.y + zoom.y : 0;
  const levels = zoom ? levelsAt(zoom.magnify, zoom.whole) : REST;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 1;

  for (const level of levels) {
    const firstColumn = Math.ceil((fx + (-BEYOND - fx) / level.scale - w / 2) / CELL - 0.5) - 1;
    const lastColumn = Math.floor((fx + (w + BEYOND - fx) / level.scale - w / 2) / CELL - 0.5) + 1;
    const firstRow = Math.ceil((fy + (-BEYOND - fy) / level.scale - h / 2) / CELL - 0.5) - 1;
    const lastRow = Math.floor((fy + (h + BEYOND - fy) / level.scale - h / 2) / CELL - 0.5) + 1;
    if (lastColumn - firstColumn + lastRow - firstRow > MOST_LINES) continue;
    ctx.beginPath();
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const x = fx + (gridLine(w, column, CELL) - fx) * level.scale;
      for (let y = -BEYOND; y <= h + BEYOND; y += STEP) {
        sway(x, y, 1);
        if (y === -BEYOND) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    }
    for (let row = firstRow; row <= lastRow; row += 1) {
      const y = fy + (gridLine(h, row, CELL) - fy) * level.scale;
      for (let x = -BEYOND; x <= w + BEYOND; x += STEP) {
        sway(x, y, 1);
        if (x === -BEYOND) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    }
    ctx.globalAlpha = level.alpha;
    ctx.strokeStyle = `hsl(40 30% 90% / ${LINE})`;
    ctx.stroke();
    if (mass) {
      const near = ctx.createRadialGradient(mass.x, mass.y, 0, mass.x, mass.y, DIP_GLOW);
      near.addColorStop(0, `hsl(44 100% 82% / ${(DIP_LIT * clamp01(sheet.dip.at)).toFixed(3)})`);
      near.addColorStop(1, "hsl(44 100% 82% / 0)");
      ctx.strokeStyle = near;
      ctx.stroke();
      for (const ring of rings) {
        if (ring.light < 0.004) continue;
        const inner = Math.max(0, ring.front - PULSE_BAND * 1.5);
        const outer = ring.front + PULSE_BAND * 1.5;
        const band = ctx.createRadialGradient(mass.x, mass.y, inner, mass.x, mass.y, outer);
        band.addColorStop(0, "hsl(44 100% 80% / 0)");
        band.addColorStop((ring.front - inner) / (outer - inner), `hsl(44 100% 80% / ${ring.light.toFixed(3)})`);
        band.addColorStop(1, "hsl(44 100% 80% / 0)");
        ctx.strokeStyle = band;
        ctx.stroke();
      }
    }
    if (lit > 0.004) {
      const pool = ctx.createRadialGradient(well.x, well.y, 0, well.x, well.y, WELL_GLOW);
      pool.addColorStop(0, `hsl(44 100% 80% / ${(WELL_LIT * lit).toFixed(3)})`);
      pool.addColorStop(1, "hsl(44 100% 80% / 0)");
      ctx.strokeStyle = pool;
      ctx.stroke();
    }
    for (const body of bodies) {
      const light = BODY_LIT * clamp01(body.lift.at) * (body.depth / MOON);
      if (light < 0.004) continue;
      const round = ctx.createRadialGradient(body.at.x, body.at.y, 0, body.at.x, body.at.y, BODY_GLOW);
      round.addColorStop(0, `hsl(44 100% 80% / ${light.toFixed(3)})`);
      round.addColorStop(1, "hsl(44 100% 80% / 0)");
      ctx.strokeStyle = round;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  if (zoom && anchor) {
    const by = zoom.magnify;
    drawSeed(ctx, { x: fx + (anchor.x - fx) * by, y: fy + (anchor.y - fy) * by, w: anchor.w * by, h: anchor.h * by, r: anchor.r * by }, sheet.grown);
  }

  const sky = Math.min(h, SKY);
  const back = zoom ? zoom.magnify / zoom.whole : 1;
  const passes: Level[] = zoom
    ? [
        { scale: zoom.magnify, alpha: 1 - smooth((zoom.magnify - 1) / (STAR_GONE - 1)) },
        { scale: back, alpha: smooth((back - STAR_BACK) / (1 - STAR_BACK)) },
      ]
    : REST;
  for (const pass of passes) {
    if (pass.alpha <= 0.01) continue;
    for (const [x, y, size, delay, period] of STARS) {
      sway(fx + (x * w - fx) * pass.scale, fy + (y * sky - fy) * pass.scale, STAR_CARRY);
      const beatOf = age === null ? 0.25 : (age / 1000 + delay) / period;
      const twinkle = 0.5 - 0.5 * Math.cos(beatOf * Math.PI * 2);
      const near = lit * clamp01(1 - Math.hypot(px - well.x, py - well.y) / WELL_GLOW);
      const glow = (STAR_DIM + (1 - STAR_DIM) * Math.max(twinkle * STAR_REST, near)) * pass.alpha;
      ctx.globalAlpha = glow * 0.22;
      ctx.fillStyle = STAR_HALO;
      ctx.beginPath();
      ctx.arc(px, py, size * 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = glow;
      ctx.fillStyle = STAR_CORE;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

interface FabricProps {
  mass: RefObject<HTMLElement>;
  armed: boolean;
  frame?: RefObject<HTMLElement>;
  grow?: boolean;
  onExpand?: (progress: number, zoom: Zoom | null) => void;
  mark?: RefObject<HTMLElement>;
  className?: string;
}

export const HeroFabric = forwardRef<FabricHandle, FabricProps>(function HeroFabric({ mass, armed, frame, grow = false, onExpand, mark, className }, handle) {
  const reduced = usePrefersReducedMotion();
  const [canvasRef, visible] = useInView<HTMLCanvasElement>({ once: false, threshold: 0, rootMargin: "0px" });
  const sheet = useRef<Sheet>({ mass: null, well: { x: 0, y: 0 }, lift: { at: 0, speed: 0 }, dip: { at: 0, speed: 0 }, pulses: [], grown: 1, site: null, anchor: null, lived: null });
  const born = useRef(0);
  const shown = useRef(false);
  const expands = Boolean(frame) && !reduced;

  useImperativeHandle(
    handle,
    () => ({
      pulse: (strength = 1) => {
        if (reduced) return;
        sheet.current.pulses.push({ born: performance.now(), strength });
      },
      expansion: (progress: number) => {
        if (!expands) return;
        const state = sheet.current;
        state.grown = progress;
        if (progress <= 0) state.anchor = null;
        canvasRef.current?.style.setProperty("--frame-veil", veilOf(progress));
        onExpand?.(progress, state.site && state.anchor ? zoomAt(progress, state.anchor, state.site.frame) : null);
      },
    }),
    [reduced, expands, onExpand, canvasRef]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const host = canvas?.parentElement;
    if (!canvas || !ctx || !host) return;
    const dpr = Math.min(window.devicePixelRatio || 1, RATIO);
    const state = sheet.current;
    const aim = { ...state.well };
    const goal = armed ? 1 : 0;
    const subject = expands ? (frame?.current ?? null) : null;
    if (!subject) {
      state.grown = 1;
      state.site = null;
    }
    let over = false;
    let w = 0;
    let h = 0;
    let frameId = 0;
    let then = 0;
    let drawnAt = 0;
    let surveyedAt = 0;
    let band = "";
    let unseen = visible && !shown.current;
    shown.current = visible;
    if (!born.current) born.current = performance.now();
    if (!state.bodies) {
      state.bodies = [
        { at: { x: 0, y: 0 }, lift: { at: 0, speed: 0 }, depth: CORE, reach: CORE_REACH },
        { at: { x: 0, y: 0 }, lift: { at: 0, speed: 0 }, depth: MOON, reach: MOON_REACH },
      ];
    }
    const [core, moon] = state.bodies;
    const want = { core: 0, moon: 0 };
    const emblemHost = mark?.current ?? null;
    let emblem: SVGElement | null = null;
    let disc: SVGElement | null = null;

    const sight = () => {
      want.core = 0;
      want.moon = 0;
      if (!emblemHost) return 0;
      if (!emblem?.isConnected) emblem = emblemHost.querySelector<SVGElement>(MARK);
      const box = canvas.getBoundingClientRect();
      const at = emblem?.getBoundingClientRect();
      if (!emblem || !at || !at.width || !box.width || !box.height) return 0;
      if (!disc?.isConnected) disc = emblem.querySelector<SVGElement>(MOON_DISC);
      const phase = emblem.dataset.eclipse;
      core.at.x = ((at.left + at.width / 2 - box.left) / box.width) * w;
      core.at.y = ((at.top + at.height * CORE_AT - box.top) / box.height) * h;
      want.core = phase === "unlit" ? 0 : 1;
      if (!disc || (phase !== "closing" && phase !== "total" && phase !== "parting")) return 0;
      want.moon = phase === "total" ? 1 : Number(getComputedStyle(disc).opacity) || 0;
      if (want.moon <= 0.04) return 0;
      const orb = disc.getBoundingClientRect();
      const x = ((orb.left + orb.width / 2 - box.left) / box.width) * w;
      const y = ((orb.top + orb.height / 2 - box.top) / box.height) * h;
      const strayed = Math.hypot(x - moon.at.x, y - moon.at.y);
      moon.at.x = x;
      moon.at.y = y;
      return strayed;
    };

    const locate = () => {
      const node = mass.current;
      const box = canvas.getBoundingClientRect();
      if (!node || !box.width || !box.height) return;
      const at = node.getBoundingClientRect();
      state.mass = { x: ((at.left + at.width / 2 - box.left) / box.width) * w, y: ((at.top + at.height / 2 - box.top) / box.height) * h };
    };
    const survey = (now: number) => {
      surveyedAt = now;
      state.site = subject ? measureSite(subject, canvas, w, h, CELL) : null;
      if (!state.site) return;
      const { x, y, w: wide, h: tall } = state.site.frame;
      const next = `${x.toFixed(0)} ${y.toFixed(0)} ${wide.toFixed(0)} ${tall.toFixed(0)}`;
      if (next === band) return;
      band = next;
      canvas.style.setProperty("--frame-top", `${y.toFixed(0)}px`);
      canvas.style.setProperty("--frame-foot", `${(y + tall).toFixed(0)}px`);
      canvas.style.setProperty("--frame-left", `${x.toFixed(0)}px`);
      canvas.style.setProperty("--frame-right", `${(x + wide).toFixed(0)}px`);
    };
    const draw = (now: number) => paint(ctx, w, h, dpr, state, now, reduced ? null : now - born.current);
    const size = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      locate();
      survey(performance.now());
      sight();
      if (reduced) {
        state.dip.at = 1;
        core.lift.at = want.core;
      }
      draw(performance.now());
    };
    const tick = (now: number) => {
      frameId = window.requestAnimationFrame(tick);
      const elapsed = then ? Math.min(now - then, 64) : 16;
      then = now;
      locate();
      let grew = false;
      if (subject) {
        const aimed = grow ? 1 : 0;
        const next = unseen ? aimed : advance(state.grown, aimed, elapsed);
        unseen = false;
        if (next !== state.grown) {
          state.grown = next;
          grew = true;
          if (next <= 0) state.anchor = null;
          else if (!state.anchor) state.anchor = state.lived ?? state.site?.seed ?? null;
          canvas.style.setProperty("--frame-veil", veilOf(next));
          onExpand?.(next, state.site && state.anchor ? zoomAt(next, state.anchor, state.site.frame) : null);
        }
        if (state.grown < 1 && now - surveyedAt > MEASURE_MS) survey(now);
      }
      const near = 1 - Math.exp(-elapsed / FOLLOW_MS);
      state.well.x += (aim.x - state.well.x) * near;
      state.well.y += (aim.y - state.well.y) * near;
      springTowards(state.lift, over ? 1 : 0, elapsed, WELL_MS, WELL_DAMPING);
      springTowards(state.dip, goal, elapsed, DIP_MS, DIP_DAMPING);
      const strayed = sight();
      springTowards(core.lift, want.core, elapsed, BODY_MS, BODY_DAMPING);
      springTowards(moon.lift, want.moon, elapsed, BODY_MS, BODY_DAMPING);
      const orbiting =
        (strayed > BODY_STEP && Math.abs(moon.lift.at) > 0.02) ||
        Math.abs(core.lift.at - want.core) > 0.003 ||
        Math.abs(core.lift.speed) > 0.02 ||
        Math.abs(moon.lift.at - want.moon) > 0.003 ||
        Math.abs(moon.lift.speed) > 0.02;
      state.pulses = state.pulses.filter((pulse) => ((now - pulse.born) / 1000) * PULSE_SPEED < PULSE_REACH);
      const moving =
        grew ||
        orbiting ||
        state.pulses.length > 0 ||
        Math.abs(state.lift.at - (over ? 1 : 0)) > 0.003 ||
        Math.abs(state.lift.speed) > 0.02 ||
        Math.abs(state.dip.at - goal) > 0.002 ||
        Math.abs(state.dip.speed) > 0.02 ||
        (over && Math.hypot(aim.x - state.well.x, aim.y - state.well.y) > 0.4);
      if (!moving && now - drawnAt < IDLE_FRAME_MS) return;
      drawnAt = now;
      draw(now);
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
      const x = ((event.clientX - box.left) / box.width) * w;
      const y = ((event.clientY - box.top) / box.height) * h;
      const formed = state.grown >= 1 ? state.site?.frame : undefined;
      const covered = formed !== undefined && x >= formed.x && x <= formed.x + formed.w && y >= formed.y && y <= formed.y + formed.h;
      if (!inside || covered) {
        over = false;
        return;
      }
      aim.x = x;
      aim.y = y;
      if (!over && Math.abs(state.lift.at) < 0.05) {
        state.well.x = aim.x;
        state.well.y = aim.y;
      }
      over = true;
    };
    const onLeave = () => {
      over = false;
    };

    size();
    const sizes = new ResizeObserver(size);
    sizes.observe(canvas);
    if (visible && !reduced) {
      frameId = window.requestAnimationFrame(tick);
      host.addEventListener("pointermove", onMove);
      host.addEventListener("pointerleave", onLeave);
    }
    return () => {
      window.cancelAnimationFrame(frameId);
      sizes.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [canvasRef, mass, frame, grow, onExpand, mark, expands, visible, reduced, armed]);

  return <canvas ref={canvasRef} aria-hidden="true" data-frame={frame ? "" : undefined} className={cn("hero-fabric", className)} />;
});
