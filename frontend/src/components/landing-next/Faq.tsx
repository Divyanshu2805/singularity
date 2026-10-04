/**
 * The new landing page's questions and answers.
 *
 * Handles: on the left, the heading (Heading) with a small card under it for whoever is still unsure - the horizon
 * mark, one line and the app's primary button to start - which stays in view while the questions scroll past on a
 * wide screen; on the right, the questions (questions.ts) as one list in the app's menu material: a single gold hover wash
 * glides from row to row as the app's menus and sidebar do (useGlideHighlight), each row leads with an icon tile that
 * fills with gold when its question is open, its plus folds into a minus, and the open row takes the app's selected
 * look - the gold wash with a glow along its left edge. An answer unfolds under its question and its words stream
 * in one after another. One question is open at a time; the first is open to begin with.
 *
 * Each question is a real button (aria-expanded, aria-controls) over a labelled region; the arrow keys, Home and End
 * move between questions. The rows come in with the scroll, each dropping a short way into its place at its full size
 * as it comes up the screen (the owner asked for questions that fall rather than grow), reversing on the way back up.
 * Under reduced motion nothing drops or streams: the rows are there and answers open without easing.
 */
import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ArrowRight } from "lucide-react";
import { HorizonMark } from "@/components/HorizonMark";
import { SlideLink } from "@/components/SlideLink";
import { Button } from "@/components/ui/button";
import { usePrefersReducedMotion } from "@/components/landing/motion";
import { useGlideHighlight } from "@/hooks/use-glide-highlight";
import { clamp01, easeOut, useScrollScene } from "@/lib/scroll-scene";
import { Heading } from "./Heading";
import { QUESTIONS } from "./questions";

const DROP = 26;

export function Faq() {
  const [open, setOpen] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const pillRef = useGlideHighlight(listRef);
  const reduced = usePrefersReducedMotion();
  const id = useId();

  useScrollScene(listRef, (frame) => {
    const list = listRef.current;
    if (!list || reduced) return;
    list.querySelectorAll<HTMLElement>("[data-row]").forEach((row) => {
      const top = row.getBoundingClientRect().top - (Number(row.dataset.drop) || 0);
      const shown = easeOut(clamp01((frame.viewport * 0.96 - top) / (frame.viewport * 0.28)));
      const drop = -(1 - shown) * DROP;
      row.dataset.drop = drop.toFixed(1);
      row.style.transform = `translate3d(0, ${drop.toFixed(1)}px, 0)`;
      row.style.opacity = shown.toFixed(3);
    });
  });

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = QUESTIONS.length - 1;
    const to = event.key === "ArrowDown" ? Math.min(last, index + 1) : event.key === "ArrowUp" ? Math.max(0, index - 1) : event.key === "Home" ? 0 : event.key === "End" ? last : -1;
    if (to < 0) return;
    event.preventDefault();
    buttons.current[to]?.focus();
  };

  return (
    <section id="faq" aria-labelledby="faq-title" className="landing-wrap relative scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto grid max-w-[82.5rem] gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Heading id="faq-title" eyebrow="FAQ" title="Questions," accent="answered." align="start" />
          <div className="ln-ask auth-panel relative mt-10 max-w-sm p-6">
            <span className="relative inline-flex h-10 w-10">
              <span aria-hidden="true" className="nav-brand-glow pointer-events-none absolute -inset-[55%] rounded-full opacity-70" style={{ animation: "none" }} />
              <HorizonMark className="relative h-full w-full" />
            </span>
            <p className="mt-4 font-display text-[21px] font-semibold tracking-tight text-foreground">Still wondering?</p>
            <p className="mt-1.5 text-[14px] leading-[1.6] text-muted-foreground">The quickest answer is to try it. Start on the free plan.</p>
            <Button asChild className="mt-5" style={{ "--icon-hover": "translateX(3px)" } as CSSProperties}>
              <SlideLink to="/login">
                Start building
                <ArrowRight />
              </SlideLink>
            </Button>
          </div>
        </div>

        <div ref={listRef} className="ln-faq relative flex flex-col gap-1.5">
          <span ref={pillRef} aria-hidden="true" className="glide-pill ln-faq-pill" />
          {QUESTIONS.map(({ icon: Icon, q, a }, index) => {
            const isOpen = open === index;
            const words = a.split(" ");
            return (
              <div key={q} data-row data-glide data-open={isOpen} className="ln-faq-row relative rounded-2xl">
                <h3>
                  <button
                    ref={(node) => {
                      buttons.current[index] = node;
                    }}
                    id={`${id}-q${index}`}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`${id}-a${index}`}
                    onClick={() => setOpen(isOpen ? -1 : index)}
                    onKeyDown={(event) => onKey(event, index)}
                    className="flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="ln-faq-icon grid h-9 w-9 shrink-0 place-items-center rounded-[11px]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 text-[16px] font-medium tracking-[-0.01em] text-foreground">{q}</span>
                    <span aria-hidden="true" className="ln-faq-toggle relative h-4 w-4 shrink-0" />
                  </button>
                </h3>
                <div id={`${id}-a${index}`} role="region" aria-labelledby={`${id}-q${index}`} className="ln-faq-fold">
                  <div>
                    <p className="ln-faq-answer pb-5 pl-[4.25rem] pr-12 text-[14.5px] leading-[1.7] text-muted-foreground">
                      {words.map((word, order) => (
                        <span key={order} className="ln-faq-word" style={{ "--i": order } as CSSProperties}>
                          {word}{" "}
                        </span>
                      ))}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
