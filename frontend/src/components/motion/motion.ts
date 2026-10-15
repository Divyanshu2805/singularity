/**
 * The small motion kit the signed-in app, the sign-in pages and the pricing page share.
 *
 * Handles: reading the reduced-motion preference and following it if it changes, knowing when an element is on
 * screen, tracking the pointer across a card as --mx/--my (followPointer, which the cards' glare reads) and tilting a
 * card towards it as --rx/--ry (tiltToPointer, for a mouse only and never under reduced motion, and releaseTilt to let
 * it settle back), playing a one-off entrance on a set of elements with an optional stagger (play - the sign-in pages'
 * and the app's headline drops and rises), and a stopwatch that only runs while something is visible.
 *
 * Animations are driven by elapsed time rather than chained timeouts, so pausing one (scrolled away, or reduced
 * motion) is just not advancing the clock, and a still frame is the clock pinned at its end.
 */
import { useEffect, useRef, useState } from "react";
import { EASE_OUT } from "./intro";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia(REDUCED_QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(REDUCED_QUERY);
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function useInView<T extends Element>({ once = true, threshold = 0.15, rootMargin = "0px 0px -8% 0px" } = {}) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold, rootMargin }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [once, threshold, rootMargin]);

  return [ref, inView] as const;
}

export const STILL = Number.MAX_SAFE_INTEGER;

export function useStopwatch(running: boolean, still: boolean, loopMs?: number): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (still || !running) return;
    const start = performance.now();
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed(performance.now() - start), 80);
    return () => window.clearInterval(timer);
  }, [running, still]);

  if (still) return STILL;
  return loopMs ? elapsed % loopMs : elapsed;
}

export function followPointer(event: { currentTarget: HTMLElement; clientX: number; clientY: number }) {
  const node = event.currentTarget;
  const rect = node.getBoundingClientRect();
  node.style.setProperty("--mx", `${(((event.clientX - rect.left) / rect.width) * 100).toFixed(1)}%`);
  node.style.setProperty("--my", `${(((event.clientY - rect.top) / rect.height) * 100).toFixed(1)}%`);
}

export function tiltToPointer(event: { currentTarget: HTMLElement; clientX: number; clientY: number; pointerType: string }, degrees: number) {
  followPointer(event);
  if (event.pointerType !== "mouse" || window.matchMedia(REDUCED_QUERY).matches) return;
  const node = event.currentTarget;
  const rect = node.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  node.style.setProperty("--ry", `${((x - 0.5) * degrees * 2).toFixed(2)}deg`);
  node.style.setProperty("--rx", `${((0.5 - y) * degrees * 2).toFixed(2)}deg`);
}

export function releaseTilt(event: { currentTarget: HTMLElement }) {
  event.currentTarget.style.setProperty("--rx", "0deg");
  event.currentTarget.style.setProperty("--ry", "0deg");
}

export function play(elements: Iterable<Element>, keyframes: Keyframe[], { delay = 0, step = 0, duration = 650, easing = EASE_OUT } = {}) {
  if (typeof Element.prototype.animate !== "function" || window.matchMedia(REDUCED_QUERY).matches) return () => {};
  const running = Array.from(elements, (element, index) => {
    element.getAnimations().forEach((animation) => {
      if (!("animationName" in animation) && !("transitionProperty" in animation)) animation.finish();
    });
    return element.animate(keyframes, { duration, delay: delay + index * step, easing, fill: "backwards" });
  });
  return () => running.forEach((animation) => animation.cancel());
}
