/**
 * The fade-and-rise wrapper landing sections enter with.
 *
 * Handles: holding its children lowered and transparent until they first scroll into view, then easing them up, with
 * an optional delay so siblings can stagger. The styles live in index.css's .landing-reveal, which drops the motion entirely
 * under reduced motion.
 */
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useInView } from "./motion";

export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const [ref, shown] = useInView<HTMLDivElement>();

  return (
    <div ref={ref} data-shown={shown} className={cn("landing-reveal", className)} style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}>
      {children}
    </div>
  );
}
