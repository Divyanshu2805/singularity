/**
 * The landing page being rebuilt. It is served at /genesis in development only (App.tsx) while it is made, and is
 * meant to take over the root once the owner approves it.
 *
 * Handles: putting the page together - the background (genesis/Sky.tsx: the app's own sky, the star field with the
 * dashboard's wash of colour at the foot of the window), the navigation (LandingNav, with the home page's six
 * links), and every section of the content plan (docs/landing-content-plan.md) in the order a visitor's questions
 * come: the hero, which now holds the project window too (genesis/Hero.tsx), how it works (genesis/Steps.tsx),
 * what you can build (Examples), the two ways the app explains its own work (Understand), the rest of the features
 * in four chapters (FeatureChapters), the plans (PlanShowcase), the questions (Faq), the closing call (ClosingCall)
 * and the footer (Footer) - with the home page's ids, so the navigation's links and its highlight carry over, and
 * with smooth scrolling (Lenis, motion.ts). Everything stands inside the opening (genesis/Opening.tsx), which covers
 * the page as it loads and tells the hero when to bring its pieces in. The root carries .landing-page, which gives
 * it the landing type and the brighter text tokens and is how the page slide knows the page has rendered;
 * data-intro, set to "live" since this page does not use the home page's opening clock (landing/intro.ts), so
 * nothing that reads it is held back; and .genesis, which scopes the few rules this page changes in pieces it shares
 * with the home page (genesis.css).
 *
 * The order of work is the owner's: the background first, then all the content laid out on it, and only then
 * animation, transitions and motion. New motion is written with Motion (motion/react; the page stands inside
 * landing/MotionFeatures.tsx, which loads it): the sky's level following the scroll, the shared fade-and-rise
 * (Reveal) and, in the hero, the opening and the entrances behind it. Below the hero nothing is pinned and no
 * section has a device of its own: the sections are the home page's own components, with the copy, the films and
 * the small entrances they already had, and how it works is the flat list rather than the orbit.
 *
 * This is the second approach to the rebuild. The first was one continuous WebGL scene behind the page - a sky with
 * a worked-out Milky Way, a black hole above the headline that the visitor's typing fed, and a burst of light that
 * the first screen of scroll played. The owner saw the hero and the burst and turned it down: the sky read as a
 * brownish haze, and neither the black hole nor the flash was wanted. The owner then chose the app's own sky for the
 * background, from three, and had that scene's code deleted; it was never committed, so it is not in the history.
 */
import type { ReactNode } from "react";
import { Hero } from "@/components/genesis/Hero";
import { Opening } from "@/components/genesis/Opening";
import { Sky } from "@/components/genesis/Sky";
import { Steps } from "@/components/genesis/Steps";
import { ClosingCall } from "@/components/landing/ClosingCall";
import { Examples } from "@/components/landing/Examples";
import { Faq } from "@/components/landing/Faq";
import { FeatureChapters } from "@/components/landing/FeatureChapters";
import { Footer } from "@/components/landing/Footer";
import { LandingNav, type NavLink } from "@/components/landing/LandingNav";
import { MotionFeatures } from "@/components/landing/MotionFeatures";
import { useSmoothScroll } from "@/components/landing/motion";
import { PlanShowcase } from "@/components/landing/PlanShowcase";
import { HOME_QUESTIONS } from "@/components/landing/questions";
import { Understand } from "@/components/landing/Understand";
import "@/components/landing/home.css";
import "@/components/genesis/genesis.css";

const NAV_LINKS: NavLink[] = [
  { label: "How it works", id: "workbench" },
  { label: "Examples", id: "examples" },
  { label: "Understand", id: "understand" },
  { label: "Features", id: "features" },
  { label: "Pricing", id: "pricing" },
  { label: "FAQ", id: "faq" },
];

function Stage({ children }: { children: ReactNode }) {
  return (
    <MotionFeatures>
      <div data-intro="live" className="landing-page genesis relative min-h-screen overflow-x-clip bg-background">
        <Opening>{children}</Opening>
      </div>
    </MotionFeatures>
  );
}

export default function Genesis() {
  useSmoothScroll();

  return (
    <Stage>
      <Sky />
      <LandingNav links={NAV_LINKS} />
      <main className="relative">
        <Hero />
        <Steps />
        <Examples />
        <Understand />
        <FeatureChapters />
        <PlanShowcase />
        <Faq questions={HOME_QUESTIONS} aside={false} tucked={false} />
        <ClosingCall />
      </main>
      <Footer />
    </Stage>
  );
}
