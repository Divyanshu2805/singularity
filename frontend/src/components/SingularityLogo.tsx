/**
 * The product's name set as text, for the brand lockups.
 *
 * Handles: the wordmark - the name wiped in from the left (and faded) when `drawn` is given, played forwards on open and
 * backwards and quicker on close, so it finishes before whatever holds it has gone; with no `drawn` it simply shows. It
 * respects a reduced-motion preference. The text can be swapped (the landing nav shows just "Singularity"), defaulting
 * to the full product name.
 *
 * The mark that once sat beside it here - a gold tile with a check and a spark, in static and self-building forms, with
 * a glow and a looping build - was taken out (2026-10-03) once HorizonMark replaced it everywhere; only the wordmark
 * remained in use, and HorizonMark pairs it with the new mark.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT = "cubic-bezier(0.32, 0.72, 0, 1)";

function timing(drawn: boolean, open: { delay: number; duration: number }, close: { delay: number; duration: number }) {
  return drawn ? open : close;
}

export function Wordmark({ drawn, className, children = "Singularity" }: { drawn?: boolean; className?: string; children?: ReactNode }) {
  const isAnimated = drawn !== undefined;
  const isDrawn = drawn ?? true;
  const name = timing(isDrawn, { delay: 220, duration: 420 }, { delay: 0, duration: 180 });

  return (
    <span
      className={cn(isAnimated && "motion-reduce:!transition-none", className)}
      style={
        isAnimated
          ? {
              clipPath: isDrawn ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
              opacity: isDrawn ? 1 : 0,
              transition: `clip-path ${name.duration}ms ${EASE_OUT} ${name.delay}ms, opacity ${name.duration}ms linear ${name.delay}ms`,
            }
          : undefined
      }
    >
      {children}
    </span>
  );
}
