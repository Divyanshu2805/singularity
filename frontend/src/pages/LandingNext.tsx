/**
 * The new landing page, built at /landing-next while it is being made (the route exists in development only), and
 * meant to take over the root once the owner says so.
 *
 * Handles: putting the page together - the sky every section stands on (LandingBackdrop: its stars smear into short
 * strokes as the page moves, so a scroll reads as the view travelling, and lean in towards the footer's black hole as
 * the page nears its end), the navigation, and the sections in order: the journey (the eclipse hero, the app's window
 * rising from behind the horizon and the five steps of how it works, on one pinned stage), the features, security
 * (the orrery), the plans, the questions, and the closing call over the black hole with the footer - the page's one
 * opening clock (landing/intro.ts), which the sky, the eclipse, the headline and the navigation all take their cues
 * from, and smooth scrolling (Lenis, motion.ts). The root carries .landing-page, which gives it the landing type and
 * the brighter text tokens and is how the page slide knows the page has rendered, and data-intro, "playing" until
 * the opening reaches INTRO.live.
 *
 * The page is one flight through one star system, every section a celestial event that acts out one part of the
 * product, in the signed-in app's own material and type. Every claim on it is something the app does today.
 */
import { useRef, type ReactNode } from "react";
import { LandingBackdrop } from "@/components/landing/LandingBackdrop";
import { INTRO, IntroContext, useIntroClock, useIntroReached } from "@/components/landing/intro";
import { useSmoothScroll } from "@/components/landing/motion";
import { Faq } from "@/components/landing-next/Faq";
import { FeatureBento } from "@/components/landing-next/FeatureBento";
import { Footer } from "@/components/landing-next/Footer";
import { Journey } from "@/components/landing-next/Journey";
import { Nav } from "@/components/landing-next/Nav";
import { Pricing } from "@/components/landing-next/Pricing";
import { Security } from "@/components/landing-next/Security";
import "@/components/landing-next/landing-next.css";

function Stage({ children }: { children: ReactNode }) {
  const live = useIntroReached(INTRO.live);

  return (
    <div data-intro={live ? "live" : "playing"} className="landing-page ln-page relative min-h-screen overflow-x-clip bg-background">
      {children}
    </div>
  );
}

export default function LandingNext() {
  const intro = useIntroClock();
  const holeRef = useRef<HTMLDivElement>(null);
  useSmoothScroll();

  return (
    <IntroContext.Provider value={intro}>
      <Stage>
        <LandingBackdrop streak infall={holeRef} />
        <Nav />
        <main className="relative">
          <Journey />
          <FeatureBento />
          <Security />
          <Pricing />
          <Faq />
        </main>
        <Footer holeRef={holeRef} />
      </Stage>
    </IntroContext.Provider>
  );
}
