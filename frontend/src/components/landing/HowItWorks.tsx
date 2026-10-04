/**
 * How it works: one project's life told as five steps - describe, answer, build, run, change - played on the app's
 * own screens.
 *
 * Handles: the section and its heading, and choosing how the steps are told. A wide screen with motion allowed gets
 * the orbit (StepOrbit): the steps round a dark planet, lit by a comet that falls with the scroll and sends its
 * light round the rim. Anything narrower, and anyone who has asked for reduced motion, gets the steps as a list
 * beside the window, playing on a clock (StepList). Both read the same five steps (how-steps.ts).
 *
 * The section was the list alone while the home page was being laid out content first; the owner then asked for the
 * first landing page's turning light back, started by "a star or comet" that "hits the planet while falling and
 * scrolling". In the orbit the section runs the full width of the page and clips sideways only, since the orbit pins
 * itself with position: sticky and an ancestor that clipped on every side would stop that. The heading stands in
 * front of the comet, which passes behind it on the way down, so its words are never washed out by the light.
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SectionIntro } from "./SectionIntro";
import { StepList } from "./StepList";
import { StepOrbit } from "./StepOrbit";
import { usePrefersReducedMotion } from "./motion";

const WIDE = "(min-width: 1024px)";
const ORBIT_GAP = "4rem";

function useWide() {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(WIDE).matches);

  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return wide;
}

export function HowItWorks() {
  const reduced = usePrefersReducedMotion();
  const wide = useWide();
  const orbit = wide && !reduced;

  return (
    <section id="workbench" className={cn("relative scroll-mt-24 pb-20 pt-24 sm:pb-28 sm:pt-32", orbit ? "overflow-x-clip" : "landing-wrap")}>
      <div className={cn("relative z-30", orbit && "landing-wrap")}>
        <SectionIntro eyebrow="How it works" title="From a sentence" accent="to something you can click." />
      </div>
      {orbit ? (
        <div style={{ marginTop: ORBIT_GAP }}>
          <StepOrbit />
        </div>
      ) : (
        <StepList />
      )}
    </section>
  );
}
