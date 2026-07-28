/**
 * Reveals streamed text at a readable pace instead of in the bursts the network delivers it in.
 *
 * Handles: a floor pace plus an exponential catch-up so the display never trails the network by much, skipping
 * instantly over ranges that are not readable text (the protocol's tags), and stopping short of a tag that has only
 * half arrived.
 *
 * How far each reveal has got is kept outside React, keyed per message, so a component remounting - navigating to
 * another project and back while a response is still streaming - picks up where it left off instead of retyping from
 * the top.
 */
import { useEffect, useRef, useState } from "react";

export type TextRange = readonly [start: number, end: number];

interface SmoothStreamOptions {
  visibleRanges?: (text: string) => TextRange[];
  safeEnd?: (text: string) => number;
}

const MIN_CHARS_PER_SEC = 70;
const CATCH_UP_SECONDS = 0.5;

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

export function useSmoothStream(
  target: string,
  enabled: boolean,
  options: SmoothStreamOptions = {},
  persistKey?: string,
  instantUpTo = 0
): string {
  const [shownLength, setShownLength] = useState(() => initialCursor(persistKey, enabled, target.length));
  const cursorRef = useRef(shownLength);
  const hasAnimatedRef = useRef(enabled);
  const rafRef = useRef<number | null>(null);
  const latestRef = useRef({ target, enabled, options });
  latestRef.current = { target, enabled, options };

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
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [target, enabled, persistKey, instantUpTo]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  return target.slice(0, shownLength);
}
