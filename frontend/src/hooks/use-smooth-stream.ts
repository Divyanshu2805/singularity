import { useEffect, useRef, useState } from "react";

export type TextRange = readonly [start: number, end: number];

interface SmoothStreamOptions {
  /** Ranges of `target` that render as readable text. Everything else is skipped instantly. */
  visibleRanges?: (text: string) => TextRange[];
  /** Furthest index the reveal may reach while streaming (e.g. before a half-arrived tag). */
  safeEnd?: (text: string) => number;
}

// Readable floor pace, plus an exponential catch-up so the display never trails the
// network by much more than CATCH_UP_SECONDS no matter how bursty the chunks are.
const MIN_CHARS_PER_SEC = 70;
const CATCH_UP_SECONDS = 0.5;

/**
 * How far each in-progress reveal has gotten, keyed by `persistKey` - kept outside React so a component
 * remounting (e.g. navigating to another project's chat and back while a response is still streaming)
 * picks up from where it left off instead of retyping everything from the top. Cleared once a key's
 * stream finishes, so this only ever holds entries for turns that are still actively streaming.
 */
const revealProgress = new Map<string, number>();

function initialCursor(persistKey: string | undefined, enabled: boolean, targetLength: number): number {
  if (enabled && persistKey) {
    const resumed = revealProgress.get(persistKey);
    if (resumed !== undefined) return Math.min(resumed, targetLength);
  }
  return enabled ? 0 : targetLength;
}

function visibleCharsBetween(ranges: TextRange[], from: number, to: number) {
  let total = 0;
  for (const [start, end] of ranges) {
    total += Math.max(0, Math.min(end, to) - Math.max(start, from));
  }
  return total;
}

function advanceCursor(ranges: TextRange[], cursor: number, end: number, budget: number) {
  for (const [start, rangeEnd] of ranges) {
    const stop = Math.min(rangeEnd, end);
    if (stop <= cursor) continue;
    if (cursor < start) cursor = Math.min(start, end);
    if (cursor >= end) return end;
    const take = Math.min(budget, stop - cursor);
    cursor += take;
    budget -= take;
    if (cursor < stop) return cursor;
  }
  return end;
}

/**
 * Reveals a growing string at a smooth, frame-locked pace instead of snapping to whatever
 * the network just delivered. Content that isn't visible text is skipped immediately, so
 * hidden sections (like a file body) reflect real progress rather than a fake typing delay.
 *
 * Mounting with `enabled: false` shows everything at once (history never replays a typing
 * effect). Once a reveal has started, it finishes gracefully after `enabled` turns off.
 *
 * `persistKey` (typically the message's id) lets a still-streaming reveal survive a remount: without it,
 * a component destroyed and recreated (e.g. by switching projects and switching back) would start its
 * cursor over at 0 and retype content that was already shown before the remount, even though the
 * underlying store kept streaming the real content the whole time it was unmounted.
 */
export function useSmoothStream(
  target: string,
  enabled: boolean,
  options: SmoothStreamOptions = {},
  persistKey?: string,
  /**
   * Characters that count as already seen and appear at once instead of being typed out - the backlog a page
   * receives when it reattaches to a response after a refresh. Only moves the reveal forward, never back.
   */
  instantUpTo = 0
): string {
  const [shownLength, setShownLength] = useState(() => initialCursor(persistKey, enabled, target.length));
  const cursorRef = useRef(shownLength);
  const hasAnimatedRef = useRef(enabled);
  const rafRef = useRef<number | null>(null);
  const latestRef = useRef({ target, enabled, options });
  latestRef.current = { target, enabled, options };

  // The stream for this key is done (or never started here) - stop remembering progress for it, so a
  // future reuse of the same key (shouldn't happen; ids are unique) never resumes from stale data.
  useEffect(() => {
    if (!enabled && persistKey) revealProgress.delete(persistKey);
  }, [enabled, persistKey]);

  useEffect(() => {
    if (enabled) hasAnimatedRef.current = true;
    if (target.length < cursorRef.current) {
      cursorRef.current = 0;
      setShownLength(0);
      if (persistKey) revealProgress.set(persistKey, 0);
    }
    if (!hasAnimatedRef.current) {
      cursorRef.current = target.length;
      setShownLength(target.length);
      return;
    }
    // Jump straight to text that was on screen before a refresh. Clamped to the safe end, so a tag that has only
    // half-arrived still isn't shown raw.
    const { safeEnd } = latestRef.current.options;
    const alreadySeen = Math.min(instantUpTo, enabled && safeEnd ? safeEnd(target) : target.length);
    if (alreadySeen > cursorRef.current) {
      cursorRef.current = alreadySeen;
      setShownLength(alreadySeen);
      if (persistKey) revealProgress.set(persistKey, alreadySeen);
    }
    if (rafRef.current !== null) return;

    let last = performance.now();
    let carry = 0;

    const tick = (now: number) => {
      // Real elapsed time, so a janky or throttled (background tab) frame catches up instead of lagging.
      const dt = Math.min(now - last, 1000) / 1000;
      last = now;

      const { target: text, enabled: streaming, options: opts } = latestRef.current;
      const end = streaming && opts.safeEnd ? opts.safeEnd(text) : text.length;
      const ranges = opts.visibleRanges ? opts.visibleRanges(text) : [[0, text.length] as const];
      const cursor = cursorRef.current;

      const backlog = visibleCharsBetween(ranges, cursor, end);
      carry += Math.max(MIN_CHARS_PER_SEC * dt, backlog * (1 - Math.exp(-dt / CATCH_UP_SECONDS)));
      const budget = Math.floor(carry);
      carry -= budget;

      const next = Math.max(cursor, advanceCursor(ranges, cursor, end, budget));
      if (next !== cursor) {
        cursorRef.current = next;
        setShownLength(next);
        if (persistKey) revealProgress.set(persistKey, next);
      }

      if (next >= end) {
        rafRef.current = null; // caught up - the next target change restarts the loop
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    // persistKey is stable for the life of a mounted component (it's a message id), so this never
    // actually restarts the loop - just keeps the dependency list honest.
  }, [target, enabled, persistKey, instantUpTo]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null; // otherwise a re-run effect (Fast Refresh, StrictMode) thinks the loop is still alive
    };
  }, []);

  return target.slice(0, shownLength);
}
