/**
 * The fade-and-rise wrapper landing sections enter with.
 *
 * Handles: holding its children lowered and transparent until they first scroll into view, then easing them up, with
 * an optional delay so siblings can stagger; under reduced motion they are simply there.
 *
 * It is written with Motion (motion/react), the library the landing page's new motion is built on
 * (docs/practices/coding-conventions.md). Until then it was an IntersectionObserver setting a data attribute that a
 * pair of rules in index.css (.landing-reveal) animated; the distance, the timing and the curve are those rules',
 * unchanged, as is when it counts as in view (a little of it showing, a little above the window's foot). At rest the
 * element carries no offset, so its type is drawn sharp. It uses the light form of the library (m, with the features
 * loaded by the page: landing/MotionFeatures.tsx), so a page that shows it must stand inside that provider.
 */
import type { ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";

const RISE = 22;
const EASE = [0.2, 0.7, 0.2, 1] as const;
const VIEW = { once: true, amount: 0.15, margin: "0px 0px -8% 0px" } as const;

export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduced = useReducedMotion();

  return (
    <m.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: RISE }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEW}
      transition={{ duration: 0.85, delay: delay / 1000, ease: EASE }}
    >
      {children}
    </m.div>
  );
}
