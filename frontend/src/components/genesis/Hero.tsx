/**
 * The hero of the landing page's rebuild (pages/Genesis.tsx): what the product is, the app's own prompt as the call
 * to action, and the real project window beside it - the layout of a reference page the owner recorded and asked to
 * have matched, with the page's own content.
 *
 * Handles: the layout - from 1280px up, two columns on one screen: on the left the logo, the headline ("Where an
 * idea instantly expands into an app.", the owner's wording, on three lines), one line saying what the product
 * does, the prompt (IdeaPrompt - what is typed there is waiting in the dashboard after sign-up) and a note that it
 * is free to start; on the right the project window playing a build (AppGlassCard), whole on the screen and
 * standing in a slight perspective, its right side nearer. Below that width the copy is centred on the first screen
 * and the window is flat and whole under it (genesis.css has both). Behind it all, stars fall (Meteors.tsx).
 *
 * And the entrance, which is the hero's half of the opening (Opening.tsx puts the cover over it; lib/opening.ts has
 * the timetable): while the cover closes, the headline, the line, the prompt and the note come up one after
 * another, and the window comes up once, as a whole. Only when those have landed do the things that run on begin:
 * the logo's eclipse (EclipseMark, the home page's - a moon crossing a sun and leaving the logo, again and again),
 * the film in the window and the falling stars. Every entrance is opacity and a transform, handed to the browser to
 * run, and each piece is left with no transform of its own once it has arrived, so its type is drawn sharp. A page
 * without an opening shows everything in place.
 *
 * The window's perspective is a still pose (genesis.css, .genesis-window); it is on the element inside the one that
 * rises, since Motion owns the transform of the element it moves. That element is marked data-tilt, which is how
 * the film inside knows to measure itself flat (landing/AppReplica.tsx); for the same reason it must never be given
 * a CSS transition on its transform.
 *
 * This is the hero's second pass at the reference. The first followed the recording more closely and the owner cut
 * it back: a ribbon of gold threads behind the window, a typed badge over the headline and a typed note, the
 * headline coming out of a blur, the window's panels arriving one by one, the window following the pointer and
 * running off the right edge of the screen. Before that, a black hole above the headline and a shader-drawn ribbon
 * had stood here and been taken out too. The project window used to be a section of its own under the hero.
 */
import type { ReactNode } from "react";
import * as m from "motion/react-m";
import { Meteors } from "@/components/genesis/Meteors";
import { useBeat, useOpening } from "@/components/genesis/sequence";
import { AppGlassCard } from "@/components/landing/AppGlassCard";
import { EclipseMark } from "@/components/landing/EclipseMark";
import { IdeaPrompt } from "@/components/landing/IdeaPrompt";
import { OPENING, RISE_EASE } from "@/lib/opening";

const LOW = { opacity: 0, transform: "translateY(16px)" };
const UP = { opacity: 1, transform: "translateY(0px)", transitionEnd: { transform: "none" } };

function Rise({ at, duration, className, children }: { at: number; duration: number; className?: string; children: ReactNode }) {
  const stage = useOpening();

  return (
    <m.div
      className={className}
      initial={stage === "over" ? false : LOW}
      animate={stage === "held" ? LOW : UP}
      transition={{ delay: at / 1000, duration: duration / 1000, ease: RISE_EASE }}
    >
      {children}
    </m.div>
  );
}

const piece = (order: number) => ({ at: OPENING.copy.at + order * OPENING.copy.step, duration: OPENING.copy.for });

export function Hero() {
  const mark = useBeat(OPENING.mark);
  const film = useBeat(OPENING.film);
  const stars = useBeat(OPENING.stars);

  return (
    <section id="hero" className="genesis-hero">
      <Meteors play={stars} />
      <div className="landing-wrap genesis-hero-grid">
        <div className="genesis-hero-copy">
          <EclipseMark start={mark} className="mb-6 h-14 w-14 sm:mb-7 sm:h-[4.5rem] sm:w-[4.5rem] xl:h-16 xl:w-16" />
          <Rise {...piece(0)}>
            <h1 className="genesis-headline landing-heading font-display">
              Where an idea <br className="hidden xl:block" />
              instantly <br className="hidden sm:block xl:hidden" />
              expands <br className="hidden xl:block" />
              into an <em className="heat-text -mb-[0.1em] inline-block animate-heat-sweep pb-[0.1em] pr-2 font-medium motion-reduce:animate-none">app.</em>
            </h1>
          </Rise>
          <Rise {...piece(1)} className="mt-6 max-w-2xl xl:mt-7 xl:max-w-[30rem]">
            <p className="text-balance text-[17px] leading-[1.6] text-foreground/70 sm:text-[19px] xl:text-[18px]">
              Describe what you want. Singularity asks a few questions, writes the project file by file, and runs it live while you watch.
            </p>
          </Rise>
          <Rise {...piece(2)} className="relative isolate mt-8 w-full max-w-[44rem] sm:mt-9 xl:max-w-[30rem]">
            <IdeaPrompt />
          </Rise>
          <Rise {...piece(3)} className="mt-4">
            <p className="text-[13.5px] text-muted-foreground">Free to start. No card needed.</p>
          </Rise>
        </div>
        <Rise at={OPENING.window.at} duration={OPENING.window.for} className="genesis-hero-stage">
          <div role="img" aria-label="The project workspace, building an app" data-tilt="" className="genesis-window">
            <AppGlassCard playing={film} />
          </div>
        </Rise>
      </div>
    </section>
  );
}
