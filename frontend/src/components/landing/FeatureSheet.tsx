/**
 * The sheet of space-time the home page's features stand on: the hero's grid carried on down the page, lying behind
 * the feature cards and bent by them, since each card is a weight resting on it.
 *
 * Handles: drawing the grid (CELL apart, both line directions, seen from straight above like the hero's and the
 * sign-in page's) and bending it by the wells it is handed (paint): each well draws the lines round it towards its
 * centre (lib/spacetime.ts's sinkAt, to the depth and reach it is given), brings the lines round it up a shade gold
 * (glow), and may carry one ring on its way out - the lines pushed outwards and lit where the ring's front is (ring,
 * push, flash). What those numbers are and when they change is not decided here: feature-motion.ts reads them off the
 * scroll and hands them over every frame, and this only draws what it is given, and only when it has changed.
 *
 * The sheet is as tall as the whole section, which is several screens, so it is not one canvas. It is cut into
 * slabs (lib/feature-sheet.ts's slabsOf, none taller than SLAB), each a canvas of its own that scrolls with the page
 * like any other element - so the grid can never lag the cards it lies under, however the page is being scrolled,
 * which one canvas pinned to the screen and redrawn for each scroll position could. A slab only holds pixels while
 * it is near the screen (NEAR): a slab that has scrolled well away gives its backing store back, and one coming near
 * is sized and drawn again. A slab is redrawn only when one of the wells that reach it has changed by enough to see
 * (changed), so a sheet at rest costs nothing, and no more than one slab is redrawn in a frame: while a row of cards
 * lands, the two slabs it bends take turns, each redrawn every other frame. The slabs still scroll with the page on
 * every frame - only how far their lines are bent is a frame behind, by under a pixel - and handing a full canvas
 * to the screen was most of what a redraw cost, so two a frame cost twice what one does.
 * Every slab samples the lines at the same places down the page (multiples of STEP from the sheet's top), so a line
 * that crosses from one slab to the next meets itself exactly.
 *
 * Most of the sheet lies under the cards, which are opaque, so the part of a line under a card that has landed
 * (covered, with the card's box) is not drawn at all: the line stops UNDER pixels inside the card's edge, far enough
 * in that neither the card's rounded corners nor a passing ring can show its end. A card still rising is not yet
 * where its box is and is partly transparent, so the lines under it are drawn until it is home. That leaves about
 * half the points to bend and stroke.
 *
 * A slab's lines are stroked once. What colour and strength a line has at each point - the plain grid, the gold
 * round a well, the light of a ring's front, and the fading of the sheet's edges - is first painted on a small map
 * of the slab (tint, one pixel for every TINT of the page's, since all of it is soft gradients), and the lines are
 * then stroked with that map as their ink. Stroking the whole path again for every well and every ring, as the
 * hero's sheet does for its one mass, cost ten strokes a frame here with ten cards on the sheet.
 *
 * The grid has no border: its two sides fade out (EDGE), and so do the head of the first slab and the foot of the
 * last (HEAD_FADE, FOOT_FADE), in that same map rather than with a CSS mask - a mask would make the browser hold the
 * whole sheet as one picture, which is what the slabs are there to avoid. The canvases are drawn at no more than
 * RATIO device pixels per CSS pixel, and at fewer on a very wide screen (BUDGET pixels a slab). The sheet takes no
 * pointer events.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { slabsOf } from "@/lib/feature-sheet";
import { sinkAt } from "@/lib/spacetime";

const CELL = 44;
const STEP = 16;
const BEYOND = 66;
const PAD = 44;
const LINE = 0.075;
const RATIO = 1.5;
const SLAB = 720;
const BUDGET = 2_400_000;
const NEAR = "25% 0px 25% 0px";
const EDGE = 0.07;
const HEAD_FADE = 300;
const FOOT_FADE = 180;
const GLOW_REACH = 0.8;
const GLOW_FLAT = 0.5;
const RING_BAND = 58;
const SEEN = 0.004;
const FIELDS = 6;
const TINT = 8;
const UNDER = 32;

export interface Well {
  x: number;
  y: number;
  reach: number;
  depth: number;
  glow: number;
  ring: number;
  push: number;
  flash: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  covered: boolean;
}

export interface SheetHandle {
  paint: (wells: readonly Well[]) => void;
}

interface Slab {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  top: number;
  height: number;
  near: boolean;
  sized: boolean;
  seen: Int32Array;
}

const NO_WELLS: readonly Well[] = [];

const spanOf = (well: Well) => Math.max(well.reach, well.push !== 0 || well.flash > SEEN ? well.ring + RING_BAND * 3 : 0);

export const FeatureSheet = forwardRef<SheetHandle>(function FeatureSheet(_, handle) {
  const hostRef = useRef<HTMLDivElement>(null);
  const painter = useRef<(wells: readonly Well[]) => void>();

  useImperativeHandle(handle, () => ({ paint: (wells) => painter.current?.(wells) }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const slabs: Slab[] = [];
    const reaching: Well[] = [];
    const covering: Well[] = [];
    const tintMap = document.createElement("canvas");
    const shade = tintMap.getContext("2d");
    let wells = NO_WELLS;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let px = 0;
    let py = 0;
    let turn = 0;

    const sway = (x: number, y: number) => {
      let sx = 0;
      let sy = 0;
      for (const well of reaching) {
        const dx = well.x - x;
        const dy = well.y - y;
        const out = Math.hypot(dx, dy);
        if (out < 0.5) continue;
        let draw = out < well.reach ? sinkAt(out, well.depth, well.reach) : 0;
        if (well.push !== 0) {
          const off = (out - well.ring) / RING_BAND;
          if (off > -3 && off < 3) draw -= well.push * Math.exp(-off * off);
        }
        if (draw === 0) continue;
        sx += (dx / out) * draw;
        sy += (dy / out) * draw;
      }
      px = x + sx;
      py = y + sy;
    };

    const under = (x: number, y: number) => {
      for (const well of covering) {
        if (x > well.left + UNDER && x < well.right - UNDER && y > well.top + UNDER && y < well.bottom - UNDER) return true;
      }
      return false;
    };

    const covers = (well: Well, slab: Slab) => well.covered && well.bottom > slab.top - PAD && well.top < slab.top + slab.height + PAD;

    const reaches = (well: Well, slab: Slab) => {
      const nearest = Math.min(Math.max(well.y, slab.top - PAD), slab.top + slab.height + PAD);
      return Math.abs(well.y - nearest) < spanOf(well);
    };

    const note = (seen: Int32Array, at: number, value: number) => {
      if (seen[at] === value) return false;
      seen[at] = value;
      return true;
    };

    const changed = (slab: Slab) => {
      if (slab.seen.length !== wells.length * FIELDS) slab.seen = new Int32Array(wells.length * FIELDS).fill(-1);
      const { seen } = slab;
      let moved = false;
      for (let index = 0; index < wells.length; index += 1) {
        const well = wells[index];
        const at = index * FIELDS;
        const on = reaches(well, slab);
        if (note(seen, at, on ? Math.round(well.depth * 30) : 0)) moved = true;
        if (note(seen, at + 1, on ? Math.round(well.glow * 400) : 0)) moved = true;
        if (note(seen, at + 2, on ? Math.round(well.ring * 3) : 0)) moved = true;
        if (note(seen, at + 3, on ? Math.round(well.push * 30) : 0)) moved = true;
        if (note(seen, at + 4, on ? Math.round(well.flash * 400) : 0)) moved = true;
        if (note(seen, at + 5, covers(well, slab) ? 1 : 0)) moved = true;
      }
      return moved;
    };

    const draw = (slab: Slab) => {
      const { ctx } = slab;
      if (!ctx) return;
      const top = slab.top;
      const foot = top + slab.height;
      reaching.length = 0;
      covering.length = 0;
      for (const well of wells) {
        if (reaches(well, slab)) reaching.push(well);
        if (covers(well, slab)) covering.push(well);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, -top * dpr);
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, top, width, slab.height);

      const path = new Path2D();
      const from = Math.floor((top - PAD) / STEP) * STEP;
      const firstColumn = Math.ceil((-BEYOND - width / 2) / CELL - 0.5);
      const lastColumn = Math.floor((width + BEYOND - width / 2) / CELL - 0.5);
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const x = Math.floor(width / 2 + (column + 0.5) * CELL) + 0.5;
        let drawing = false;
        for (let y = from; y <= foot + PAD; y += STEP) {
          if (under(x, y)) {
            drawing = false;
            continue;
          }
          sway(x, y);
          if (drawing) path.lineTo(px, py);
          else path.moveTo(px, py);
          drawing = true;
        }
      }
      const firstRow = Math.ceil((top - PAD) / CELL);
      const lastRow = Math.floor((foot + PAD) / CELL);
      for (let row = firstRow; row <= lastRow; row += 1) {
        const y = row * CELL + 0.5;
        let drawing = false;
        for (let x = -BEYOND; x <= width + BEYOND; x += STEP) {
          if (under(x, y)) {
            drawing = false;
            continue;
          }
          sway(x, y);
          if (drawing) path.lineTo(px, py);
          else path.moveTo(px, py);
          drawing = true;
        }
      }

      const ink = tint(slab);
      if (!ink) return;
      ctx.lineWidth = 1;
      ctx.strokeStyle = ink;
      ctx.stroke(path);
    };

    const tint = (slab: Slab) => {
      if (!shade) return null;
      const top = slab.top;
      const foot = top + slab.height;
      const wide = Math.max(1, Math.ceil(width / TINT));
      const from = top - TINT;
      const span = slab.height + TINT * 2;
      const tall = Math.max(1, Math.ceil(span / TINT));
      if (tintMap.width !== wide || tintMap.height !== tall) {
        tintMap.width = wide;
        tintMap.height = tall;
      }
      shade.setTransform(1 / TINT, 0, 0, 1 / TINT, 0, -from / TINT);
      shade.globalCompositeOperation = "source-over";
      shade.clearRect(0, from, width, span);
      shade.fillStyle = `hsl(40 30% 90% / ${LINE})`;
      shade.fillRect(0, from, width, span);

      for (const well of reaching) {
        if (well.glow > SEEN) {
          const radius = well.reach * GLOW_REACH;
          const near = shade.createRadialGradient(well.x, well.y, 0, well.x, well.y, radius);
          near.addColorStop(0, `hsl(44 100% 82% / ${well.glow.toFixed(3)})`);
          near.addColorStop(GLOW_FLAT, `hsl(44 100% 82% / ${well.glow.toFixed(3)})`);
          near.addColorStop(1, "hsl(44 100% 82% / 0)");
          shade.fillStyle = near;
          shade.fillRect(well.x - radius, well.y - radius, radius * 2, radius * 2);
        }
        if (well.flash > SEEN) {
          const inner = Math.max(0, well.ring - RING_BAND * 1.5);
          const outer = well.ring + RING_BAND * 1.5;
          const band = shade.createRadialGradient(well.x, well.y, inner, well.x, well.y, outer);
          band.addColorStop(0, "hsl(44 100% 80% / 0)");
          band.addColorStop((well.ring - inner) / (outer - inner), `hsl(44 100% 80% / ${well.flash.toFixed(3)})`);
          band.addColorStop(1, "hsl(44 100% 80% / 0)");
          shade.fillStyle = band;
          shade.fillRect(well.x - outer, well.y - outer, outer * 2, outer * 2);
        }
      }

      shade.globalCompositeOperation = "destination-in";
      const sides = shade.createLinearGradient(0, 0, width, 0);
      sides.addColorStop(0, "rgb(0 0 0 / 0)");
      sides.addColorStop(EDGE, "#000");
      sides.addColorStop(1 - EDGE, "#000");
      sides.addColorStop(1, "rgb(0 0 0 / 0)");
      shade.fillStyle = sides;
      shade.fillRect(0, from, width, span);
      if (top < HEAD_FADE) {
        const head = shade.createLinearGradient(0, 0, 0, HEAD_FADE);
        head.addColorStop(0, "rgb(0 0 0 / 0)");
        head.addColorStop(1, "#000");
        shade.fillStyle = head;
        shade.fillRect(0, from, width, span);
      }
      if (foot > height - FOOT_FADE) {
        const tail = shade.createLinearGradient(0, height - FOOT_FADE, 0, height);
        tail.addColorStop(0, "#000");
        tail.addColorStop(1, "rgb(0 0 0 / 0)");
        shade.fillStyle = tail;
        shade.fillRect(0, from, width, span);
      }

      const ink = slab.ctx?.createPattern(tintMap, "no-repeat") ?? null;
      ink?.setTransform(new DOMMatrix([TINT, 0, 0, TINT, 0, from]));
      return ink;
    };

    const size = (slab: Slab) => {
      slab.canvas.width = Math.max(1, Math.round(width * dpr));
      slab.canvas.height = Math.max(1, Math.round(slab.height * dpr));
      slab.sized = true;
      slab.seen.fill(-1);
    };

    const release = (slab: Slab) => {
      if (!slab.sized) return;
      slab.canvas.width = 1;
      slab.canvas.height = 1;
      slab.sized = false;
    };

    const refresh = (slab: Slab) => {
      if (!slab.near || !width || !height) return;
      if (!slab.sized) size(slab);
      if (changed(slab)) draw(slab);
    };

    const sight = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const slab = slabs.find((candidate) => candidate.canvas === entry.target);
          if (!slab) continue;
          slab.near = entry.isIntersecting;
          if (slab.near) refresh(slab);
          else release(slab);
        }
      },
      { rootMargin: NEAR }
    );

    const layout = () => {
      width = host.clientWidth;
      height = host.clientHeight;
      if (!width || !height) return;
      const { count, each } = slabsOf(height, SLAB);
      dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, RATIO, Math.sqrt(BUDGET / (width * each))));
      while (slabs.length > count) {
        const gone = slabs.pop();
        if (!gone) break;
        sight.unobserve(gone.canvas);
        gone.canvas.remove();
      }
      while (slabs.length < count) {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        host.appendChild(canvas);
        slabs.push({ canvas, ctx: canvas.getContext("2d"), top: 0, height: 0, near: false, sized: false, seen: new Int32Array(0) });
        sight.observe(canvas);
      }
      slabs.forEach((slab, index) => {
        slab.top = index * each;
        slab.height = Math.min(each, height - slab.top);
        slab.canvas.style.top = `${slab.top}px`;
        slab.canvas.style.height = `${slab.height}px`;
        slab.sized = false;
        refresh(slab);
      });
    };

    painter.current = (next) => {
      wells = next;
      if (!width || !height) return;
      for (let step = 0; step < slabs.length; step += 1) {
        const at = (turn + step) % slabs.length;
        const slab = slabs[at];
        if (!slab.near) continue;
        if (!slab.sized) size(slab);
        if (!changed(slab)) continue;
        draw(slab);
        turn = at + 1;
        return;
      }
    };

    layout();
    const sizes = new ResizeObserver(layout);
    sizes.observe(host);
    return () => {
      painter.current = undefined;
      sizes.disconnect();
      sight.disconnect();
      slabs.forEach((slab) => slab.canvas.remove());
    };
  }, []);

  return <div ref={hostRef} aria-hidden="true" className="feature-sheet" />;
});
