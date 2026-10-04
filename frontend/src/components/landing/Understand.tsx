/**
 * Understand: the two ways the app explains what it built - Teach me, and ExplainLLM - each shown working.
 *
 * Handles: the section's intro and two wide panels, one per feature, each a short piece of copy beside that feature's
 * film (FeatureDemos' TeachingDemo and ExplainDemo, given enough width here to show the windows a narrow card has to
 * drop). The second panel is laid the other way round, so the pair reads as a zigzag rather than two identical rows.
 * Each panel rises into place with the scroll (scroll-rise.ts) and a soft light follows the pointer across it.
 *
 * On the first landing page these were the third of five equal feature chapters. They are the one thing other
 * builders do not lead with, so the home page gives them a section of their own, straight after "what can I build".
 *
 * Both claims are the app's as it is: Teach me is the mode on the home prompt that adds a plain-English note to each
 * file, linked to its line, and ExplainLLM is handed exactly one tool, which reads files - it cannot write - and
 * saves its answers privately to the person who asked.
 */
import type { ReactNode } from "react";
import { GraduationCap, MessagesSquare, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DemoFrame } from "./DemoFrame";
import { ExplainDemo, TeachingDemo } from "./FeatureDemos";
import { Lift } from "./Lift";
import { SectionIntro } from "./SectionIntro";
import { followPointer } from "./motion";
import { useScrollRise } from "./scroll-rise";

interface Panel {
  icon: LucideIcon;
  label: string;
  title: string;
  body: string;
  demo: ReactNode;
}

const PANELS: Panel[] = [
  {
    icon: GraduationCap,
    label: "Teach me",
    title: "Learn while it writes.",
    body: "Choose Teach me and each file arrives with a plain-English note on the idea behind it, linked to the exact line.",
    demo: <TeachingDemo />,
  },
  {
    icon: MessagesSquare,
    label: "ExplainLLM",
    title: "Ask about any line.",
    body: "Select code and ask why. It reads your files to answer and has no way to change them. Your questions stay private to you.",
    demo: <ExplainDemo />,
  },
];

const DEMO_MAX = 1.45;

export function Understand() {
  const stack = useScrollRise<HTMLDivElement>();

  return (
    <section id="understand" className="landing-wrap relative scroll-mt-24 pb-20 pt-10 sm:pb-28 sm:pt-16">
      <SectionIntro eyebrow="Understand" title="It builds the app." accent="Then it explains it." />

      <div ref={stack} className="mx-auto mt-14 max-w-[82.5rem] space-y-5 sm:mt-20">
        {PANELS.map(({ icon: Icon, label, title, body, demo }, index) => {
          const flipped = index % 2 === 1;
          return (
            <Lift key={label}>
              <article
                onPointerMove={followPointer}
                className={cn(
                  "home-card grid items-center gap-2 rounded-[24px] p-3 sm:p-4 lg:gap-6",
                  flipped ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
                )}
              >
                <span aria-hidden="true" className="home-glare" />
                <div className={cn("relative px-3 py-5 sm:px-6 sm:py-7", flipped && "lg:order-2")}>
                  <p className="flex items-center gap-2.5 text-[13px] font-medium text-foreground/70">
                    <span aria-hidden="true" className="tile-icon">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {label}
                  </p>
                  <h3 className="mt-5 font-display text-[30px] font-semibold leading-[1.08] tracking-tight text-foreground sm:text-[38px]">{title}</h3>
                  <p className="mt-4 max-w-md text-[16px] leading-[1.7] text-foreground/70">{body}</p>
                </div>
                <div className="relative min-w-0">
                  <DemoFrame max={DEMO_MAX}>{demo}</DemoFrame>
                </div>
              </article>
            </Lift>
          );
        })}
      </div>
    </section>
  );
}
