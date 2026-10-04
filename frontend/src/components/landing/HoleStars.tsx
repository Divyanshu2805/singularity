/**
 * Stars falling into the footer's black hole (FooterHole), after reflect.app's hero: a ring of small stars round the hole that turns
 * slowly, each star drifting in towards the hole and shrinking as it goes, then starting again from further out.
 *
 * Handles: scattering COUNT stars round the hole once, each with its own start, how far in it falls, its pace, a
 * negative delay (so the field starts mid-flight rather than every star setting off together) and a faint pale gold or
 * pink tint on some, and laying them out in a square box centred on the hole - index.css (.hole-stars) turns the box,
 * runs each star's fall and masks the box radially, so a star fades in at the outside and disappears just before the
 * photon ring rather than crossing the core.
 *
 * The box's size is a multiple of the hole's radius in CSS (FooterHole passes the same radius it draws with), and a
 * star's fall is a share of that size, so the field keeps its shape at every width. The box is placed by offsets from
 * the hole's centre (centerY, below its parent's top, and the parent's middle) rather than a centring translate: the
 * turn is CSS rotate, which pivots before any transform, so a translated box swung round a point at its own corner. The
 * owner asked for the stars more intense, then for a few fewer of them at mixed intensities: each star draws a level,
 * skewed so most are faint and a few bright, which sets its size (1 to 2.5px), how opaque it gets (--peak) and how
 * strong the small glow of its own tint is (--glow, read by index.css). It is plain CSS animation - no
 * frame loop - so it costs nothing to keep running. It waits for the landing intro to finish (data-intro on the page
 * root) and is left out under reduced motion.
 */
import { useMemo, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

const COUNT = 90;
const TINTS = ["255 255 255", "255 240 214", "255 226 180", "255 214 160"];

export function HoleStars({ size, centerY, className }: { size: string; centerY: string; className?: string }) {
  const stars = useMemo(
    () =>
      Array.from({ length: COUNT }, () => {
        const angle = Math.random() * Math.PI * 2;
        const from = 0.5 + Math.random() * 0.5;
        const fall = 0.45 + Math.random() * 0.35;
        const x = Math.cos(angle) * from;
        const y = Math.sin(angle) * from;
        const duration = 7 + Math.random() * 7;
        const level = Math.pow(Math.random(), 1.8);
        return {
          left: `${50 + x * 50}%`,
          top: `${50 + y * 50}%`,
          "--to-x": `calc(var(--box) * ${(-x * fall * 0.5).toFixed(4)})`,
          "--to-y": `calc(var(--box) * ${(-y * fall * 0.5).toFixed(4)})`,
          "--tint": TINTS[Math.floor(Math.random() * TINTS.length)],
          "--peak": (0.25 + 0.75 * level).toFixed(2),
          "--glow": (0.15 + 0.65 * level).toFixed(2),
          width: `${(1 + 1.5 * level).toFixed(2)}px`,
          height: `${(1 + 1.5 * level).toFixed(2)}px`,
          animationDuration: `${duration.toFixed(2)}s`,
          animationDelay: `${(-Math.random() * duration).toFixed(2)}s`,
        } as CSSProperties;
      }),
    []
  );

  return (
    <div aria-hidden="true" className={cn("hole-stars", className)} style={{ "--box": size, "--cy": centerY } as CSSProperties}>
      {stars.map((star, index) => (
        <span key={index} style={star} />
      ))}
    </div>
  );
}
