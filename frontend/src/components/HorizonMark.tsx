/**
 * The horizon mark: Singularity's logo, everywhere it appears - the landing page, the sign-in pages and the app - and
 * the name that goes beside it (BrandName): "Singularity" as one word in Fraunces, the one setting used wherever the
 * mark and the name appear together, so they all read the same. The app was called Singularity before, set as "Vibe"
 * with an italic "Craft"; the new name is one word, so it carries no accent of its own and the mark brings the colour.
 *
 * The mark is a black hole in miniature - the one the landing hero carried until a nebula replaced it there, and the
 * footer still does: a dark core with a fine ring of light, sitting on a horizon
 * line that is brightest just outside the core, under a dome of gold light that hugs the ring and fades outwards
 * (one filled glow, not a stroked arc - a stroked arc with a glow under it read as two arcs, like a rainbow), with the four-point spark the sky's sparks
 * are cut from resting on the dome's shoulder. The core is drawn over the line, so the line stops at the ring, and it
 * stays legible as a circle on a line at sixteen pixels. The view box is cropped to the core and dome, so the mark
 * fills its box; the horizon line runs on past the box's edges (the svg doesn't clip), as a horizon should.
 *
 * Handles: the build, played whenever drawn turns true, which is the landing intro told small - the horizon line draws
 * outwards from the centre, the ring traces itself up and down from where it meets the line until it closes at the
 * crown and the foot (four quarter arcs, each drawn from the line), the core fades in behind it, the dome rises into
 * place and the spark settles; then the rest - the dome breathes and every few seconds a glint runs along the horizon.
 * drawn false hides it quickly, so a caller can replay the build by toggling it (the landing navigation does on
 * hover). Without drawn it is simply shown, built and still - the small marks inside the landing page's demos and the
 * chat are these, so they cost nothing and don't replay each time their parent re-renders.
 *
 * Given an eclipse phase, the mark also carries what an eclipse needs, and nothing else changes: a sun where the core
 * stands and a halo round it, a moon - the core's own disc - that crosses the sun along the line from the centre to
 * the spark (TOWARDS, from TRANSIT away on one side to TRANSIT on the other, handed to the stylesheet as --moon-from
 * and --moon-to), and a bead of light on the limb that faces the spark, which is where the last sliver of sun goes
 * out. The home page's hero is the one place that plays it (landing/EclipseMark.tsx steps the phases and toggles
 * drawn so that the ring closes as the moon arrives); the motion is landing/home.css's, loaded with that page. Without
 * a phase none of these parts is rendered, so every other mark is exactly what it was.
 *
 * The earlier mark - a spark finishing an orbit round a lens holding a folded V - was replaced at the owner's request;
 * its build (trail arcs and the V's halves) was turned down before that. Every part of this motion is index.css's
 * .hz-mark keyframes keyed on data-drawn, so nothing re-renders while it plays, and under reduced motion it appears
 * built and holds still.
 */
import { useId, type CSSProperties } from "react";
import { Wordmark } from "@/components/SingularityLogo";
import { cn } from "@/lib/utils";

const CX = 24;
const CY = 26;
const R = 9.5;
const SPARK_X = 35.2;
const SPARK_Y = 12.7;

function sparkPath(size: number) {
  const pinch = 0.16 * size;
  const x = SPARK_X;
  const y = SPARK_Y;
  return `M ${x} ${y - size} Q ${x + pinch} ${y - pinch} ${x + size} ${y} Q ${x + pinch} ${y + pinch} ${x} ${y + size} Q ${x - pinch} ${y + pinch} ${x - size} ${y} Q ${x - pinch} ${y - pinch} ${x} ${y - size} Z`;
}

const RING = [
  `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX} ${CY - R}`,
  `M ${CX + R} ${CY} A ${R} ${R} 0 0 0 ${CX} ${CY - R}`,
  `M ${CX - R} ${CY} A ${R} ${R} 0 0 0 ${CX} ${CY + R}`,
  `M ${CX + R} ${CY} A ${R} ${R} 0 0 1 ${CX} ${CY + R}`,
];
const DOME = "M 6.5 26 A 17.5 17.5 0 0 1 41.5 26 Z";
const HORIZON = `M 2.5 ${CY} H 45.5`;
const LIMB = Math.hypot(SPARK_X - CX, SPARK_Y - CY);
const TOWARDS = { x: (SPARK_X - CX) / LIMB, y: (SPARK_Y - CY) / LIMB };
const TRANSIT = R * 2.25;

export type EclipsePhase = "unlit" | "away" | "closing" | "total" | "parting";

export function HorizonMark({ className, drawn, title, eclipse }: { className?: string; drawn?: boolean; title?: string; eclipse?: EclipsePhase }) {
  const id = `vc-horizon-${useId().replace(/:/g, "")}`;

  return (
    <svg
      viewBox="6 4 36 36"
      data-drawn={drawn === undefined ? "still" : String(drawn)}
      data-eclipse={eclipse}
      style={
        eclipse
          ? ({ "--moon-from": `${(-TOWARDS.x * TRANSIT).toFixed(2)}px ${(-TOWARDS.y * TRANSIT).toFixed(2)}px`, "--moon-to": `${(TOWARDS.x * TRANSIT).toFixed(2)}px ${(TOWARDS.y * TRANSIT).toFixed(2)}px` } as CSSProperties)
          : undefined
      }
      className={cn("hz-mark shrink-0 overflow-visible", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={`${id}-line`} x1="2.5" y1="0" x2="45.5" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="hsl(41.4 99.7% 79.8%)" stopOpacity="0" />
          <stop offset="0.14" stopColor="hsl(41.9 99.8% 82.1%)" stopOpacity="0.4" />
          <stop offset="0.31" stopColor="hsl(40 40% 95%)" />
          <stop offset="0.69" stopColor="hsl(40 40% 95%)" />
          <stop offset="0.86" stopColor="hsl(41.9 99.8% 82.1%)" stopOpacity="0.4" />
          <stop offset="1" stopColor="hsl(41.4 99.7% 79.8%)" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-dome`} cx={CX} cy={CY} r="17.5" gradientUnits="userSpaceOnUse">
          <stop offset="0.5" stopColor="hsl(40 40% 90%)" stopOpacity="0" />
          <stop offset="0.57" stopColor="hsl(40 40% 90%)" stopOpacity="0.9" />
          <stop offset="0.72" stopColor="hsl(46 100% 82%)" stopOpacity="0.45" />
          <stop offset="1" stopColor="hsl(40.6 100% 74%)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-ring`} x1="0" y1={CY - R} x2="0" y2={CY + R} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="hsl(40 40% 95%)" />
          <stop offset="0.5" stopColor="hsl(46 100% 84%)" />
          <stop offset="1" stopColor="hsl(37.6 100% 68%)" stopOpacity="0.75" />
        </linearGradient>
        <radialGradient id={`${id}-core`} cx="50%" cy="30%" r="75%">
          <stop offset="0" stopColor="hsl(30 11% 8.4%)" />
          <stop offset="0.6" stopColor="hsl(30 11% 3.4%)" />
          <stop offset="1" stopColor="hsl(30 11% 1.8%)" />
        </radialGradient>
        {eclipse && (
          <>
            <radialGradient id={`${id}-sun`} cx={CX} cy={CY} r={R} gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="hsl(48 100% 97%)" />
              <stop offset="0.62" stopColor="hsl(46 100% 86%)" />
              <stop offset="1" stopColor="hsl(40 100% 68%)" />
            </radialGradient>
            <radialGradient id={`${id}-halo`} cx={CX} cy={CY} r={R * 2.3} gradientUnits="userSpaceOnUse">
              <stop offset="0.36" stopColor="hsl(44 100% 80%)" stopOpacity="0.55" />
              <stop offset="0.62" stopColor="hsl(42 100% 70%)" stopOpacity="0.16" />
              <stop offset="1" stopColor="hsl(40 100% 66%)" stopOpacity="0" />
            </radialGradient>
          </>
        )}
      </defs>
      {eclipse && (
        <>
          <circle className="hz-halo" cx={CX} cy={CY} r={R * 2.3} fill={`url(#${id}-halo)`} />
          <circle className="hz-sun" cx={CX} cy={CY} r={R - 0.25} fill={`url(#${id}-sun)`} />
        </>
      )}
      <path className="hz-dome" d={DOME} fill={`url(#${id}-dome)`} />
      <g fill="none" strokeLinecap="round">
        <path className="hz-line" d={HORIZON} stroke={`url(#${id}-line)`} strokeWidth="1.3" />
        <path className="hz-glint" d={HORIZON} pathLength={1} stroke="hsl(40 35.7% 98.8%)" strokeWidth="1.6" />
      </g>
      {eclipse && <circle className="hz-moon" cx={CX} cy={CY} r={R} fill={`url(#${id}-core)`} />}
      <circle className="hz-core" cx={CX} cy={CY} r={R} fill={`url(#${id}-core)`} />
      <g className="hz-ring" fill="none" stroke={`url(#${id}-ring)`} strokeWidth="1.4" strokeLinecap="round">
        {RING.map((d) => (
          <path key={d} d={d} pathLength={1} />
        ))}
      </g>
      {eclipse && <circle className="hz-bead" cx={CX + TOWARDS.x * R} cy={CY + TOWARDS.y * R} r={1.5} fill="hsl(48 100% 96%)" />}
      <path className="hz-spark" d={sparkPath(3.3)} fill="hsl(40 39.9% 97.3%)" />
    </svg>
  );
}

export function BrandName({ className, drawn }: { className?: string; drawn?: boolean }) {
  return (
    <Wordmark drawn={drawn} className={cn("font-display font-semibold tracking-tight text-foreground", className)}>
      Singularity
    </Wordmark>
  );
}
