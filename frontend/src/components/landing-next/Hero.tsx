/**
 * The new landing page's hero: "Where an idea instantly expands into an app." over a total eclipse on a planet's
 * horizon - the app's mark made real - with the app's own prompt between them.
 *
 * Handles: HeroCopy - the headline in Fraunces with its last word in the sign-in heading's gold, every word its own
 * piece so each can drop on its own beat (HeadlineWords), the prompt (IdeaPrompt) a visitor can start from right
 * here, and a quiet way down to how it works - which the pinned journey (Journey.tsx) stands on its own stage and
 * lifts away as the app's window rises; and Hero, the same copy over the eclipse (Corona) on a screen-high section of
 * its own, for the screens and preferences the journey does not pin on (a phone, a short window, reduced motion). The
 * copy stands in the dark sky above the eclipse and never over its light: the corona's bright inner part starts well
 * below the prompt, and only its faintest outer streamers reach up behind the prompt's solid card.
 *
 * On a load at the top of the page the hero is made on the page's clock (DAWN): the sky fades up, the horizon's line
 * of light draws outwards from under the moon, the ring of totality brightens and the corona reaches out, the
 * headline's words drop in and the prompt and the link rise after them. Without the opening (a restored scroll, a
 * return by the page slide, reduced motion) the copy simply fades up, or is there.
 *
 * The standalone section is at least 720px tall, so on a short screen the copy and the eclipse keep their room and the
 * hero runs a little past the fold rather than crowding the moon into the prompt.
 */
import { forwardRef, useRef, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import { Corona } from "@/components/cosmos/Corona";
import { HeadlineWords } from "@/components/landing/HeadlineWords";
import { CONTENT_RISE, WORD_DROP, useIntro, useIntroStagger } from "@/components/landing/intro";
import { cn } from "@/lib/utils";
import { DAWN } from "./dawn";
import { IdeaPrompt } from "./IdeaPrompt";

export const HeroCopy = forwardRef<HTMLDivElement, { className?: string; style?: CSSProperties }>(function HeroCopy({ className, style }, ref) {
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const restRef = useRef<HTMLDivElement>(null);
  const intro = useIntro();
  useIntroStagger(headlineRef, "[data-word]", WORD_DROP, DAWN.headline, DAWN.wordStep);
  useIntroStagger(restRef, "[data-rise]", CONTENT_RISE, DAWN.prompt, 140);

  return (
    <div
      ref={ref}
      style={style}
      className={cn("relative z-10 mx-auto flex max-w-4xl flex-col items-center px-5 pt-[clamp(108px,17vh,184px)] text-center sm:px-8", className)}
    >
      <h1
        ref={headlineRef}
        className={cn(
          "landing-heading text-balance pb-2 font-display text-[42px] font-semibold leading-[1] tracking-[-0.025em] sm:text-[60px] lg:text-[72px]",
          !intro && "animate-in fade-in slide-in-from-bottom-3 duration-700 fill-mode-both"
        )}
      >
        <span className="sm:block">
          <HeadlineWords text="Where an idea instantly" />
        </span>{" "}
        <span className="sm:block">
          <HeadlineWords text="expands into an" />{" "}
          <em data-word className="heat-text inline-block animate-heat-sweep pb-[0.1em] -mb-[0.1em] pr-2 font-medium not-italic motion-reduce:animate-none">
            app.
          </em>
        </span>
      </h1>
      <div
        ref={restRef}
        className={cn("mt-8 flex w-full flex-col items-center sm:mt-9", !intro && "animate-in fade-in slide-in-from-bottom-2 delay-200 duration-700 fill-mode-both")}
      >
        <div data-rise className="w-full max-w-[40rem]">
          <IdeaPrompt />
        </div>
        <a data-rise href="#how" className="ln-quiet-link mt-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium">
          See how it works
          <ChevronDown className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
});

export function Hero() {
  return (
    <section aria-label="Singularity" className="ln-hero relative h-[100svh] min-h-[720px] overflow-hidden">
      <Corona className="inset-0" />
      <HeroCopy />
    </section>
  );
}
