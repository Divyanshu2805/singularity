/**
 * The fabric in the recommended plan's card: the faint grid that fades out towards the card's top, with cells of it
 * lighting and fading on their own slow beats - drawn on a canvas so that it can ripple.
 *
 * Handles: sizing the canvas to the card and redrawing when the card resizes; drawing the grid's lines, CELL apart
 * and anchored to the card's bottom-left corner, as the CSS background it replaced was; the ripple - rings travelling
 * outwards from the middle of the card's bottom edge, where its light pools, one every RIPPLE_MS and RIPPLE_SPAN
 * apart, each pushing the grid's points a few pixels (RIPPLE) along the line from that point, less with distance
 * (RIPPLE_REACH) and not at all at the source itself (RIPPLE_CALM); and the lit cells (CELLS: a column and a row
 * counted from the bottom-left, a delay and a period in seconds), each a square of the grid drawn through the same
 * ripple so it stays on its lines, which come up only once the card has landed and keep their beats from that moment
 * however often the card leaves the screen; and the pointer - while it is over the card the rings from the light
 * grow (HOVER_GAIN) and quicken a little (HOVER_PACE), the grid's lines come up a shade (HOVER_LIT), and a second
 * set of rings spreads from the pointer (TOUCH, TOUCH_SPAN, TOUCH_REACH), as cloth does under a fingertip, all of it
 * easing in and out over HOVER_MS rather than switching. Those second rings are broad and slow, and their centre
 * trails the pointer (TOUCH_FOLLOW_MS) rather than sitting on it: the first take had them tight, quick and pinned to
 * the cursor, and with the rings from the light running through them the lines looked crumpled - the owner asked
 * for the hover to be smoother. The canvas itself takes no pointer events, so it listens on the card it sits in.
 *
 * The owner asked for the middle card's fabric to be animated a bit, after the features section's floor had been
 * given its ripple; this is that ripple laid flat. They then asked for the card to ripple more under the pointer. The grid and its cells were a CSS background and sixteen spans
 * until then, which could pulse but not bend. The fade towards the top of the card is a CSS mask on the canvas
 * (.plan-fabric), so nothing above REACH of the card's height is drawn at all.
 *
 * The ripple's phase is kept between runs of the effect and advanced by elapsed time, so quickening it under the
 * pointer never makes it jump. The loop runs only while the canvas is on screen. Under reduced motion one still frame is drawn - the grid flat and
 * every cell half lit - and left.
 */
import { useEffect, useRef } from "react";
import { useInView, usePrefersReducedMotion } from "./motion";

const CELL = 30;
const STEP = 6;
const REACH = 0.88;
const RIPPLE = 2.6;
const RIPPLE_SPAN = 120;
const RIPPLE_REACH = 340;
const RIPPLE_CALM = 46;
const RIPPLE_MS = 4400;
const HOVER_GAIN = 0.8;
const HOVER_LIT = 0.8;
const HOVER_PACE = 0.2;
const HOVER_MS = 620;
const TOUCH = 3.2;
const TOUCH_SPAN = 160;
const TOUCH_REACH = 240;
const TOUCH_CALM = 54;
const TOUCH_PACE = 1.15;
const TOUCH_FOLLOW_MS = 260;
const CELLS_IN_MS = 1400;
const DIM = 0.12;
const STILL = 0.5;
const LINE = 0.055;
const CELL_EDGE = "hsl(40 40% 92% / 0.2)";
const CELL_FILL = "hsl(46 100% 86% / 0.05)";
const CELLS = [
  [0, 0, 0.4, 7.5],
  [1, 0, 2.6, 9],
  [1, 1, 1.2, 8],
  [3, 0, 3.8, 10],
  [4, 0, 0, 8.5],
  [4, 1, 2, 7],
  [5, 1, 4.4, 9.5],
  [5, 2, 1.6, 8],
  [7, 0, 3, 9],
  [8, 0, 0.8, 7.5],
  [8, 1, 5, 10],
  [9, 2, 2.4, 8.5],
  [10, 0, 1, 9],
  [11, 1, 3.4, 8],
  [12, 0, 4.8, 9.5],
  [13, 1, 2.2, 7.5],
];

type Press = { x: number; y: number; lift: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function ring(x: number, y: number, fromX: number, fromY: number, size: number, span: number, reach: number, calm: number, turn: number): [number, number] {
  const dx = x - fromX;
  const dy = y - fromY;
  const out = Math.hypot(dx, dy);
  if (out < 1) return [0, 0];
  const swell = size * Math.exp(-out / reach) * ((out * out) / (out * out + calm * calm)) * Math.sin((out / span) * Math.PI * 2 - turn);
  return [(dx / out) * swell, (dy / out) * swell];
}

function paint(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, turn: number | null, age: number | null, touch: Press) {
  const top = h * (1 - REACH);
  const sway = (x: number, y: number): [number, number] => {
    if (turn === null) return [x, y];
    const [ax, ay] = ring(x, y, w / 2, h, RIPPLE * (1 + touch.lift * HOVER_GAIN), RIPPLE_SPAN, RIPPLE_REACH, RIPPLE_CALM, turn);
    if (touch.lift < 0.004) return [x + ax, y + ay];
    const [bx, by] = ring(x, y, touch.x, touch.y, TOUCH * touch.lift, TOUCH_SPAN, TOUCH_REACH, TOUCH_CALM, turn * TOUCH_PACE);
    return [x + ax + bx, y + ay + by];
  };

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = `hsl(40 30% 90% / ${(LINE * (1 + touch.lift * HOVER_LIT)).toFixed(4)})`;
  ctx.beginPath();
  for (let x = 0.5; x < w; x += CELL) {
    for (let y = h; y > top - STEP; y -= STEP) {
      const [px, py] = sway(x, y);
      if (y === h) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  }
  for (let y = h - CELL + 0.5; y > top; y -= CELL) {
    for (let x = 0; x < w + STEP; x += STEP) {
      const [px, py] = sway(x, y);
      if (x === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  }
  ctx.stroke();

  if (age === null) return;
  const shown = turn === null ? 1 : clamp01(age / CELLS_IN_MS);
  ctx.fillStyle = CELL_FILL;
  ctx.strokeStyle = CELL_EDGE;
  for (const [column, row, delay, period] of CELLS) {
    const beat = Math.max(0, age / 1000 - delay) / period;
    const lit = turn === null ? STILL : DIM + (1 - DIM) * (0.5 - 0.5 * Math.cos(beat * Math.PI * 2));
    const left = column * CELL + 0.5;
    const foot = h - row * CELL - 0.5;
    ctx.globalAlpha = lit * shown;
    ctx.beginPath();
    [
      [left, foot],
      [left + CELL - 1, foot],
      [left + CELL - 1, foot - CELL + 1],
      [left, foot - CELL + 1],
    ].forEach(([x, y], corner) => {
      const [px, py] = sway(x, y);
      if (corner === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function PlanFabric({ landed }: { landed: boolean }) {
  const reduced = usePrefersReducedMotion();
  const [canvasRef, visible] = useInView<HTMLCanvasElement>({ once: false, threshold: 0, rootMargin: "0px" });
  const since = useRef<number | null>(null);
  const turn = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (landed && since.current === null) since.current = performance.now();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const card = canvas.closest<HTMLElement>(".plan-card");
    const touch: Press = { x: 0, y: 0, lift: 0 };
    const aim = { x: 0, y: 0 };
    let over = false;
    let w = 0;
    let h = 0;
    let frame = 0;
    let then = 0;

    const draw = (now: number) => {
      const age = since.current === null ? null : now - since.current;
      paint(ctx, w, h, dpr, reduced ? null : turn.current, age, touch);
    };
    const size = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      draw(performance.now());
    };
    const tick = (now: number) => {
      frame = window.requestAnimationFrame(tick);
      const elapsed = then ? Math.min(now - then, 64) : 16;
      then = now;
      const near = 1 - Math.exp(-elapsed / TOUCH_FOLLOW_MS);
      touch.x += (aim.x - touch.x) * near;
      touch.y += (aim.y - touch.y) * near;
      touch.lift += ((over ? 1 : 0) - touch.lift) * (1 - Math.exp(-elapsed / HOVER_MS));
      turn.current += (elapsed / RIPPLE_MS) * Math.PI * 2 * (1 + touch.lift * HOVER_PACE);
      draw(now);
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const box = canvas.getBoundingClientRect();
      aim.x = event.clientX - box.left;
      aim.y = event.clientY - box.top;
      if (touch.lift < 0.02) {
        touch.x = aim.x;
        touch.y = aim.y;
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
      frame = window.requestAnimationFrame(tick);
      card?.addEventListener("pointermove", onMove);
      card?.addEventListener("pointerleave", onLeave);
    }
    return () => {
      window.cancelAnimationFrame(frame);
      sizes.disconnect();
      card?.removeEventListener("pointermove", onMove);
      card?.removeEventListener("pointerleave", onLeave);
    };
  }, [canvasRef, visible, reduced, landed]);

  return <canvas ref={canvasRef} className="plan-fabric" />;
}
