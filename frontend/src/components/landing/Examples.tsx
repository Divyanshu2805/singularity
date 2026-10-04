/**
 * What you can build: six ideas of the kind the app builds well, each one a way in.
 *
 * Handles: the section's intro and six cards, each naming a kind of app and the sentence that asks for it, with one
 * action - "Start with this" - that keeps that sentence (lib/pending-idea) and leaves for sign-up by the page slide,
 * so the dashboard's prompt opens with it already typed, exactly as the hero's prompt does. The cards rise into
 * place with the scroll, one after another along each row (scroll-rise.ts), and a soft light follows the pointer
 * across the one under it.
 *
 * The first five ideas are the app's own suggestions (lib/idea-suggestions - the ones the dashboard's empty prompt
 * types out), so the home page and the app never disagree; the sixth rounds out the grid. Every one is an app that
 * runs entirely in the browser, which is what the builder makes today - nothing here needs a server or a database.
 *
 * The cards are words only for now. Each is meant to carry a capture of the app the product really built from its
 * sentence, above the text; those captures have not been made yet, and a drawn stand-in would be a claim the page
 * cannot back, so the card is laid out to read as finished without one.
 */
import { ArrowRight, CalendarDays, Coffee, Flame, Kanban, Utensils, Wallet, type LucideIcon } from "lucide-react";
import { useSlideNavigate } from "@/hooks/use-slide-navigate";
import { IDEA_SUGGESTIONS } from "@/lib/idea-suggestions";
import { savePendingIdea } from "@/lib/pending-idea";
import { Lift } from "./Lift";
import { SectionIntro } from "./SectionIntro";
import { followPointer } from "./motion";
import { useScrollRise } from "./scroll-rise";

const KINDS: { kind: string; icon: LucideIcon }[] = [
  { kind: "Tracker", icon: Flame },
  { kind: "Marketing page", icon: Coffee },
  { kind: "Productivity", icon: Kanban },
  { kind: "Dashboard", icon: Wallet },
  { kind: "Collection", icon: Utensils },
  { kind: "Planner", icon: CalendarDays },
];

const IDEAS = [...IDEA_SUGGESTIONS, "a study planner for exam week"];
const PER_ROW = 3;

const sentence = (idea: string) => idea.charAt(0).toUpperCase() + idea.slice(1);

const EXAMPLES = KINDS.map((entry, index) => ({ ...entry, idea: sentence(IDEAS[index]) }));

export function Examples() {
  const grid = useScrollRise<HTMLDivElement>();
  const slide = useSlideNavigate();

  const start = (idea: string) => {
    savePendingIdea({ text: idea, teaching: false });
    slide("/signup");
  };

  return (
    <section id="examples" className="landing-wrap relative scroll-mt-24 pb-20 pt-10 sm:pb-28 sm:pt-16">
      <SectionIntro eyebrow="What you can build" title="Start with an idea" accent="like one of these." />

      <div ref={grid} className="mx-auto mt-14 grid max-w-[82.5rem] gap-4 sm:mt-20 sm:grid-cols-2 lg:grid-cols-3">
        {EXAMPLES.map(({ kind, icon: Icon, idea }, index) => (
          <Lift key={idea} order={index % PER_ROW}>
            <button type="button" onClick={() => start(idea)} onPointerMove={followPointer} className="home-card flex h-full w-full flex-col rounded-[20px] p-5 text-left sm:p-6">
              <span aria-hidden="true" className="home-glare" />
              <span className="relative flex items-center gap-2.5 text-[13px] font-medium text-foreground/70">
                <span aria-hidden="true" className="tile-icon">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {kind}
              </span>
              <span className="relative mt-5 block font-display text-[22px] font-semibold leading-[1.2] tracking-tight text-foreground sm:text-[24px]">{idea}</span>
              <span className="home-go relative mt-auto flex items-center gap-2 pt-8 text-[13.5px] font-medium">
                Start with this
                <ArrowRight className="h-4 w-4" />
              </span>
            </button>
          </Lift>
        ))}
      </div>
    </section>
  );
}
