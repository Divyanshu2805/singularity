/**
 * How it works, on the landing page's rebuild (pages/Genesis.tsx): the five steps as a list beside a window that
 * plays each one on the app's own screens.
 *
 * Handles: the section, its anchor (#workbench, which the navigation and the hero's link glide to) and its heading,
 * over the flat telling of the steps (landing/StepList.tsx, with the copy and the films of landing/how-steps.ts).
 *
 * The home page gives a wide screen the other telling - the steps round a planet, lit by a comet, with the page held
 * while the light goes round (StepOrbit). This page does not: it is being laid out as content first, with motion to
 * be decided afterwards, and the list says everything the orbit does at every width.
 */
import { SectionIntro } from "@/components/landing/SectionIntro";
import { StepList } from "@/components/landing/StepList";

export function Steps() {
  return (
    <section id="workbench" className="landing-wrap relative scroll-mt-24 pb-20 pt-16 sm:pb-28 sm:pt-24">
      <SectionIntro eyebrow="How it works" title="From a sentence" accent="to something you can click." />
      <StepList />
    </section>
  );
}
