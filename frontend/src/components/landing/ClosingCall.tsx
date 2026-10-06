/**
 * The landing page's closing call: the page ends on the action it opened with.
 *
 * Handles: the section's heading, "What will you build first?", and under it the app's own prompt again (IdeaPrompt,
 * with its own text and the same hand-off to sign-up as the hero's). It took the place of the sign-up card that sat
 * beside the questions on the first landing page, so the page ends on the prompt instead of tucking it into a side
 * column.
 *
 * It was part of pages/Home.tsx until the page being rebuilt (pages/Genesis.tsx) needed the same section; both
 * pages show this one.
 */
import { IdeaPrompt } from "./IdeaPrompt";
import { Reveal } from "./Reveal";
import { SectionIntro } from "./SectionIntro";

export function ClosingCall() {
  return (
    <section className="landing-wrap relative pb-24 pt-6 sm:pb-32 sm:pt-10">
      <SectionIntro eyebrow="Your turn" title="What will you" accent="build first?" />
      <Reveal delay={140} className="mx-auto mt-10 max-w-[44rem] sm:mt-12">
        <IdeaPrompt label="Describe the app you want to build first" />
      </Reveal>
    </section>
  );
}
