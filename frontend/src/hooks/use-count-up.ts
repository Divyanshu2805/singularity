/**
 * A number that ticks to its new value instead of jumping there.
 *
 * Handles: animating from whatever is on screen to the value passed in (lib/count-up's easing, one frame at a time),
 * starting a first appearance from a given number so a figure that has just loaded counts up into place, and showing
 * the value outright under reduced motion. A change that arrives mid-count carries on from the number currently
 * shown, so the figure never snaps back.
 *
 * Two things keep the figure from ever being left wrong. Each frame reads the clock itself rather than trusting the
 * timestamp the frame callback is handed: jsdom's is on a different timeline, and the count never finished under
 * test. And a browser runs no frames at all for a tab in the background, where a count would sit at its starting
 * number for as long as the tab stayed there - so a hidden page is given the value outright, and a timer lands the
 * count on its target even if the frames stop part-way.
 */
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/components/landing/motion";
import { countUpAt } from "@/lib/count-up";

const DURATION_MS = 480;
const LAND_AFTER_MS = DURATION_MS + 120;

export function useCountUp(value: number, startAt: number = value): number {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(reduced ? value : startAt);
  const shownRef = useRef(shown);

  useEffect(() => {
    const from = shownRef.current;
    const land = () => {
      shownRef.current = value;
      setShown(value);
    };
    if (reduced || from === value || document.visibilityState === "hidden") {
      land();
      return;
    }
    let frame = 0;
    const startedAt = performance.now();
    const tick = () => {
      const progress = Math.min(1, (performance.now() - startedAt) / DURATION_MS);
      const next = countUpAt(from, value, progress);
      shownRef.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const landing = window.setTimeout(() => {
      cancelAnimationFrame(frame);
      land();
    }, LAND_AFTER_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(landing);
    };
  }, [value, reduced]);

  return shown;
}
