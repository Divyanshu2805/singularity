/**
 * The project window's side of the home page's hero expansion: on a load the sheet of space-time (HeroFabric) zooms
 * in on one of its squares, and the real project window, standing in that square, grows with it to its full size.
 * This file says where the window stands on the sheet, draws the square's light, and puts the zoom on the window
 * itself.
 *
 * Handles: measureSite - the place, in the sheet's own pixels: the window's box (read from the element that holds
 * the card, which is never transformed, so the box is the window's resting one even while it is growing) with the
 * card's own corner radius, and the square of the grid the zoom closes in on (lib/expansion.ts's seedOf); drawSeed -
 * the square's light: it fills with a soft gold and a wider halo and its edge comes up gold as it pops, a few pixels
 * larger, and the light is carried along by the zoom and given back early in it (litAt, swellAt) - the caller hands
 * in the square where the zoom has taken it; and revealApp - the real window at a given progress: the card is scaled
 * about the zoom's fixed point by the sheet's own magnification (a transform on the card's root, with will-change
 * set for as long as it grows so the browser keeps one full-size picture of it and never redraws it at each size),
 * and it comes into being while it is still small (the glass's own opacity, and the line and the glow at its head,
 * marked data-expand-trim with the opacity each rests at). Once the zoom is over every inline style is taken off
 * again, so the window that has arrived is exactly the one the page had before, drawn at its own size with no
 * transform, and its film is sharp.
 *
 * The owner asked for this to be "realistic ... expanding in size and look like as if we are zooming in but not
 * actually zooming in", and called the first attempt at that fake: the window scaled up over a sheet that did not
 * move, which is what a pop-up does. What makes a zoom read as one is that the ground moves with the thing on it,
 * so here the window is never animated on its own - it wears the sheet's magnification, frame for frame, and
 * nothing else on the page (the headline, the prompt, the far stars) is scaled at all.
 *
 * The glass is faded on its own element, never from a wrapper, because an ancestor below full opacity becomes the
 * backdrop root of the blur and would show the glass unblurred for the whole fade (see intro.ts); a transform on an
 * ancestor does not do that, which is why the scale can sit on the card's root.
 */
import { BEATS, clamp01, litAt, presenceAt, seedOf, swellAt, type Box, type Zoom } from "@/lib/expansion";

export interface Site {
  frame: Box;
  seed: Box;
}

const GLASS = ".hero-glass";
const TRIM = "[data-expand-trim]";

const POP_TONE = "44 100% 78%";
const POP_FILL = 0.11;
const POP_LINE = 0.55;
const POP_HALO = 0.1;
const HALO_REACH = 2.4;

export function measureSite(root: HTMLElement, canvas: HTMLElement, w: number, h: number, cell: number): Site | null {
  const origin = canvas.getBoundingClientRect();
  const rect = root.getBoundingClientRect();
  if (!origin.width || !origin.height || rect.width < 2 || rect.height < 2) return null;
  const glass = root.querySelector<HTMLElement>(GLASS);
  const fx = w / origin.width;
  const fy = h / origin.height;
  const frame: Box = {
    x: (rect.left - origin.left) * fx,
    y: (rect.top - origin.top) * fy,
    w: rect.width * fx,
    h: rect.height * fy,
    r: glass ? parseFloat(getComputedStyle(glass).borderTopLeftRadius) || 0 : 0,
  };
  return { frame, seed: seedOf(frame, w, h, cell) };
}

function trace(ctx: CanvasRenderingContext2D, box: Box) {
  const x = Math.round(box.x) + 0.5;
  const y = Math.round(box.y) + 0.5;
  const w = Math.max(1, Math.round(box.w) - 1);
  const h = Math.max(1, Math.round(box.h) - 1);
  const r = Math.max(0, Math.min(box.r, w / 2, h / 2));
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawSeed(ctx: CanvasRenderingContext2D, seed: Box, progress: number) {
  const lit = litAt(progress);
  if (lit <= 0.003) return;
  const swell = swellAt(progress);
  const box: Box = { x: seed.x - swell, y: seed.y - swell, w: seed.w + 2 * swell, h: seed.h + 2 * swell, r: seed.r };
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const reach = (Math.max(box.w, box.h) / 2) * HALO_REACH;

  ctx.save();
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach);
  halo.addColorStop(0, `hsl(${POP_TONE} / ${(POP_HALO * lit).toFixed(3)})`);
  halo.addColorStop(1, `hsl(${POP_TONE} / 0)`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, reach, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = "destination-out";
  ctx.globalAlpha = clamp01(lit * 1.5);
  ctx.beginPath();
  trace(ctx, box);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  trace(ctx, box);
  ctx.fillStyle = `hsl(${POP_TONE} / ${(POP_FILL * lit).toFixed(3)})`;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = `hsl(${POP_TONE} / ${(POP_LINE * lit).toFixed(3)})`;
  ctx.stroke();
}

export function revealApp(root: HTMLElement, progress: number, zoom: Zoom | null) {
  const glass = root.querySelector<HTMLElement>(GLASS);
  const card = glass?.parentElement;
  if (!glass || !card) return;
  const trims = root.querySelectorAll<HTMLElement>(TRIM);
  if (progress >= BEATS.zoom.to) {
    card.style.transform = "";
    card.style.transformOrigin = "";
    card.style.willChange = "";
    glass.style.opacity = "";
    glass.style.visibility = "";
    trims.forEach((trim) => {
      trim.style.opacity = "";
      trim.style.visibility = "";
    });
    return;
  }
  const present = presenceAt(progress);
  const hidden = present <= 0.001 ? "hidden" : "";
  glass.style.opacity = present.toFixed(3);
  glass.style.visibility = hidden;
  trims.forEach((trim) => {
    trim.style.opacity = (present * (Number(trim.dataset.expandTrim) || 1)).toFixed(3);
    trim.style.visibility = hidden;
  });
  if (!zoom) return;
  card.style.willChange = "transform";
  card.style.transformOrigin = `${zoom.x.toFixed(1)}px ${zoom.y.toFixed(1)}px`;
  card.style.transform = `scale(${zoom.scale.toFixed(4)})`;
}
