/**
 * The hero's mark, played as an eclipse: the logo is a dark disc ringed with light, so here it is made the way that
 * sight is made - a moon crossing a sun.
 *
 * Handles: stepping the mark (HorizonMark, which draws the sun, the moon and the bead when it is given a phase)
 * through one pass after another. The sun comes up where the core will stand (SUN_MS); the moon crosses it from the
 * lower left (INGRESS_MS), thinning it to a sliver on the limb that faces the spark; a little before the moon
 * arrives the mark is told to draw itself (DRAW_LEAD_MS), so its horizon line runs out and its ring closes round the
 * moon as the last light goes; at totality the sun's own light gives way to the mark's dome, the bead flares on the
 * limb and the spark settles beyond it - the diamond ring - and the mark is the logo, breathing, for HOLD_MS; then
 * the moon moves on the same way (EGRESS_MS), the sun returns from behind it, and the next pass begins. So the mark
 * is the finished logo for most of every pass and a crescent of sun for a few seconds between.
 *
 * The pass runs only while the mark is on screen and once the caller says to start (the hero starts it on the
 * opening sequence's first beat); scrolled away, it stops where it is and begins a fresh pass on return. The glow
 * behind the mark comes up with totality. The two crossing times are handed to the stylesheet (--eclipse-in,
 * --eclipse-out), which owns the motion (home.css). Under reduced motion there is no eclipse: the mark is simply
 * shown, built and still.
 *
 * The hero's sheet of space-time reads this eclipse too (HeroFabric's mark): it finds the mark's svg and the moon's
 * disc inside this element by their classes and bends under them, so the phase on the svg (data-eclipse) and the
 * moon's place and opacity are what the sheet's curve follows. Nothing here has to tell it anything.
 *
 * The owner asked for an eclipse animation on this mark after the hero was themed. The mark's other homes - the
 * navigation, the footer, the app - keep the plain build.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { HorizonMark, type EclipsePhase } from "@/components/HorizonMark";
import { cn } from "@/lib/utils";
import { useInView, usePrefersReducedMotion } from "./motion";

const SUN_MS = 600;
const INGRESS_MS = 1700;
const DRAW_LEAD_MS = 450;
const HOLD_MS = 9500;
const EGRESS_MS = 1700;

export function EclipseMark({ start, className }: { start: boolean; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [ref, visible] = useInView<HTMLSpanElement>({ once: false, threshold: 0.2, rootMargin: "0px" });
  const [phase, setPhase] = useState<EclipsePhase>("unlit");
  const [drawn, setDrawn] = useState(false);
  const live = start && visible && !reduced;

  useEffect(() => {
    if (!live) return;
    let timers: number[] = [];
    const after = (ms: number, run: () => void) => timers.push(window.setTimeout(run, ms));
    const pass = () => {
      timers = [];
      setDrawn(false);
      setPhase("away");
      after(SUN_MS, () => setPhase("closing"));
      after(SUN_MS + INGRESS_MS - DRAW_LEAD_MS, () => setDrawn(true));
      after(SUN_MS + INGRESS_MS, () => setPhase("total"));
      after(SUN_MS + INGRESS_MS + HOLD_MS, () => {
        setDrawn(false);
        setPhase("parting");
      });
      after(SUN_MS + INGRESS_MS + HOLD_MS + EGRESS_MS, pass);
    };
    pass();
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [live]);

  const shown = reduced || drawn;

  return (
    <span
      ref={ref}
      className={cn("relative inline-flex shrink-0", className)}
      style={{ "--eclipse-in": `${INGRESS_MS}ms`, "--eclipse-out": `${EGRESS_MS}ms` } as CSSProperties}
    >
      <span aria-hidden="true" className={cn("pointer-events-none absolute -inset-[55%] transition-opacity duration-1000", shown ? "opacity-100" : "opacity-0")}>
        <span className="nav-brand-glow absolute inset-0 rounded-full" />
      </span>
      <HorizonMark className="relative h-full w-full" drawn={shown} eclipse={reduced ? undefined : phase} />
    </span>
  );
}
