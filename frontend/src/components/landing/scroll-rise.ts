/**
 * The entrance the home page's content shares: pieces that come up into place as the visitor scrolls to them, and go
 * back the way they came when the page is scrolled up.
 *
 * Handles: turning the scroll position into each piece's place, the way the plans' cards do it (PlanShowcase, which
 * the owner asked for the rest of the content to follow). Inside the container this hook returns a ref for, every
 * element marked data-lift is a cell that never moves, and its first child is the piece that does: it starts a little
 * low, slightly small and transparent, and rises as its cell travels up from near the bottom edge of the screen
 * (START) over TRAVEL of a screen, slowing into place (GLIDE) and fading up early (APPEAR). A cell's data-lift value
 * is its order in its row, which holds it back by STEP for each place, so a row of cards arrives one after another
 * rather than as one slab. Every piece chases the scroll with a short ease (FOLLOW_MS), so a wheel's steps become one
 * movement - unless the frames have stalled (a tab coming back from the background), when it goes straight to where
 * the scroll is instead of finishing a movement nobody saw start.
 *
 * The cell is measured and its child is moved, so a piece's own transform never feeds back into where it is thought
 * to be, and a card that tilts under the pointer keeps its transform to itself. The loop runs only while the container
 * is near the screen and writes straight to each piece; a piece at rest carries no transform at all, so its type is
 * drawn sharp. Nothing here re-renders React. Under reduced motion nothing is posed: the content is simply there.
 *
 * Two parts of it are shared: riseMeasure, how far along its rise a cell is for where it stands on the screen (0 at
 * the start, 1 in place, and on past 1 as the page is scrolled further, which this hook clamps and others read on),
 * and chase, the ease a value follows the scroll with. The features' sheet (feature-motion.ts) reads both, so the
 * well a card presses into the sheet opens in step with the card's own rise.
 */
import { useLayoutEffect } from "react";
import { useInView, usePrefersReducedMotion } from "./motion";

const START = 0.94;
const TRAVEL = 0.36;
const MIN_TRAVEL = 150;
const RISE = 56;
const SCALE = 0.96;
const APPEAR = 2.6;
const GLIDE = 2.2;
const STEP = 0.16;
const FOLLOW_MS = 130;
const STALLED_MS = 250;
const CAUGHT_UP = 0.0005;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function riseMeasure(top: number, order: number, viewport: number) {
  return (viewport * START - top) / Math.max(MIN_TRAVEL, viewport * TRAVEL) - order * STEP;
}

export function chase(at: number, goal: number, elapsedMs: number) {
  if (Number.isNaN(at) || elapsedMs > STALLED_MS) return goal;
  const eased = goal + (at - goal) * Math.exp(-elapsedMs / FOLLOW_MS);
  return Math.abs(eased - goal) < CAUGHT_UP ? goal : eased;
}

function rest(piece: HTMLElement) {
  if (piece.dataset.pose === undefined) return;
  delete piece.dataset.pose;
  piece.style.removeProperty("transform");
  piece.style.removeProperty("opacity");
}

function pose(piece: HTMLElement, progress: number) {
  if (progress >= 1) {
    rest(piece);
    return;
  }
  const settle = 1 - Math.pow(1 - progress, GLIDE);
  const y = (1 - settle) * RISE;
  const scale = SCALE + (1 - SCALE) * settle;
  const opacity = clamp01(progress * APPEAR);
  const next = `${y.toFixed(2)}|${scale.toFixed(4)}|${opacity.toFixed(3)}`;
  if (piece.dataset.pose === next) return;
  piece.dataset.pose = next;
  piece.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
  piece.style.opacity = opacity.toFixed(3);
}

export function useScrollRise<T extends HTMLElement>() {
  const reduced = usePrefersReducedMotion();
  const [ref, near] = useInView<T>({ once: false, threshold: 0, rootMargin: "40% 0px 40% 0px" });

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const cells = Array.from(root.querySelectorAll<HTMLElement>("[data-lift]"));
    const pieces = cells.map((cell) => cell.firstElementChild as HTMLElement | null);
    const orders = cells.map((cell) => Number(cell.dataset.lift) || 0);

    if (reduced) {
      pieces.forEach((piece) => piece && rest(piece));
      return;
    }

    const place = (follow: (index: number, goal: number) => number) => {
      const viewport = window.innerHeight;
      cells.forEach((cell, index) => {
        const piece = pieces[index];
        if (!piece) return;
        const goal = clamp01(riseMeasure(cell.getBoundingClientRect().top, orders[index], viewport));
        pose(piece, follow(index, goal));
      });
    };

    if (!near) {
      place((_, goal) => goal);
      return;
    }

    const pos = cells.map(() => Number.NaN);
    let frame = 0;
    let then = 0;
    const tick = (now: number) => {
      frame = window.requestAnimationFrame(tick);
      const elapsed = then ? now - then : 16;
      then = now;
      place((index, goal) => (pos[index] = chase(pos[index], goal, elapsed)));
    };
    place((index, goal) => (pos[index] = goal));
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [near, reduced, ref]);

  return ref;
}
