/**
 * The provider a landing page stands in so that its Motion pieces can animate.
 *
 * Handles: loading the part of Motion (motion/react) the landing pages use - animation, variants, in-view and hover
 * and press - once, for every m component under it (LazyMotion with domAnimation). The pages write their pieces
 * with m rather than motion, which carries none of those features itself, so the library costs the landing chunk
 * about a third of what the full component does: with the full one, a single shared wrapper (Reveal) added some 43
 * kB gzipped to the home page. strict makes a full motion component under it an error in development, so that
 * saving cannot be undone by accident. Layout and drag animations are not in this set; a page that comes to need
 * them should load domMax here instead.
 */
import type { ReactNode } from "react";
import { LazyMotion, domAnimation } from "motion/react";

export function MotionFeatures({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
