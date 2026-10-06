/**
 * The background of the landing page's rebuild (pages/Genesis.tsx): the app's own sky, so the page a visitor lands
 * on and the app they sign in to are one place.
 *
 * Handles: the two layers the signed-out pricing page already stands on, in the same order - the landing's star sky
 * (LandingBackdrop: sparse stars thinned towards the middle of the screen, with a film of grain) and over it the
 * wash of colour the dashboard and the sign-in page have at the foot of the window (app/Nebula.tsx, without its own
 * stars, since the sky under it has them): rose at the left, amber in the middle, gold at the right - and how strong
 * that wash is as the page is read. It opens at nearly the dashboard's full strength (OPEN), behind a hero that is
 * as open as the dashboard's, and settles to the strength the app gives its pages that are mostly panels (REST) by
 * the time the hero has been scrolled past (OVER of a screen), since the rest of this page is cards and films that
 * have to be read over it. The app itself makes the same distinction between its two kinds of page (index.css,
 * .nebula's --sky-strength); here one page is both kinds, so the level follows the scroll. The scroll position is
 * read and turned into that level by Motion (useScroll, useTransform), which writes it as one custom property
 * without re-rendering anything (genesis.css hands it to the wash).
 *
 * This took the place of a scene drawn for this page alone - a WebGL sky with a worked-out Milky Way, a black hole
 * above the headline and a burst of light when the hero was scrolled away. The owner saw it and turned all three
 * down: the sky read as a brownish haze, and neither the black hole nor the flash was wanted. The order of work
 * changed with that: the background first, then every section's content laid out on it, and motion only afterwards.
 */
import { useScroll, useTransform } from "motion/react";
import * as m from "motion/react-m";
import { Nebula } from "@/components/app/Nebula";
import { LandingBackdrop } from "@/components/landing/LandingBackdrop";

const OPEN = 0.95;
const REST = 0.58;
const OVER = 0.9;

const eased = (passed: number) => passed * passed * (3 - 2 * passed);

export function Sky() {
  const { scrollY } = useScroll();
  const wash = useTransform(scrollY, (scrolled) => {
    const passed = Math.min(1, Math.max(0, scrolled / Math.max(1, window.innerHeight * OVER)));
    return OPEN + (REST - OPEN) * eased(passed);
  });

  return (
    <>
      <LandingBackdrop />
      <m.div aria-hidden="true" className="genesis-sky pointer-events-none fixed inset-0" style={{ "--wash": wash } as never}>
        <Nebula stars={false} className="absolute" />
      </m.div>
    </>
  );
}
