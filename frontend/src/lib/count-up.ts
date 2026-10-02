/**
 * The number a counter shows part-way through ticking from one value to another.
 *
 * Handles: easing between the two values (fast at first, settling at the end, so the last digits land gently) and
 * rounding to a whole number, since everything counted here - projects, tokens, requests - is one. The ends are
 * exact: no progress gives the starting value and full progress the target, whatever the rounding in between.
 */
export function countUpAt(from: number, to: number, progress: number): number {
  if (progress <= 0) return from;
  if (progress >= 1) return to;
  const eased = 1 - Math.pow(1 - progress, 3);
  return Math.round(from + (to - from) * eased);
}
