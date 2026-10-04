/**
 * Where a section of the landing page is in its pass through the screen, and one shared loop that tells it.
 *
 * Handles: the pure measures every scroll-linked piece of the landing page is driven by - how far a section has come
 * in from the bottom of the screen (enter), how far through its own scroll length a pinned section is (through), and
 * how far it has gone out over the top (leave) - plus remapping one stretch of a progress onto 0 to 1 (span) and the
 * eases the page's camera moves use; and useScrollScene, which hands a section those measures once per frame while
 * the page scrolls or the window changes size.
 *
 * Every subscriber shares one scroll listener and one animation frame, so however many sections listen, the page
 * reads layout once per frame per section and never re-renders anything: a callback writes transforms and opacity
 * straight onto its own elements. That is deliberate - animating a custom property that a large subtree's paint
 * depends on made the old feature stage repaint every frame. Smooth scrolling (Lenis, motion.ts) moves the window's
 * own scroll position, so the native scroll event is all this needs to hear.
 */
import { useEffect, useRef, type RefObject } from "react";

export interface ScenePlace {
  top: number;
  height: number;
  viewport: number;
}

export interface SceneFrame extends ScenePlace {
  enter: number;
  through: number;
  leave: number;
}

export const clamp01 = (value: number) => (value <= 0 ? 0 : value >= 1 ? 1 : value);

export const span = (progress: number, from: number, to: number) => (to === from ? (progress >= to ? 1 : 0) : clamp01((progress - from) / (to - from)));

export const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

export const mix = (from: number, to: number, t: number) => from + (to - from) * t;

export function measure({ top, height, viewport }: ScenePlace): SceneFrame {
  const room = Math.max(1, height - viewport);
  return {
    top,
    height,
    viewport,
    enter: clamp01((viewport - top) / viewport),
    through: clamp01(-top / room),
    leave: clamp01(-(top + height - viewport) / viewport),
  };
}

type Listener = () => void;

const listeners = new Set<Listener>();
let frame = 0;

const run = () => {
  frame = 0;
  listeners.forEach((listener) => listener());
};

const schedule = () => {
  if (!frame) frame = window.requestAnimationFrame(run);
};

function subscribe(listener: Listener) {
  if (listeners.size === 0) {
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
  }
  listeners.add(listener);
  schedule();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    }
  };
}

export function useScrollScene(ref: RefObject<Element>, onFrame: (frame: SceneFrame) => void) {
  const latest = useRef(onFrame);
  latest.current = onFrame;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    return subscribe(() => {
      const box = node.getBoundingClientRect();
      latest.current(measure({ top: box.top, height: box.height, viewport: window.innerHeight }));
    });
  }, [ref]);
}
