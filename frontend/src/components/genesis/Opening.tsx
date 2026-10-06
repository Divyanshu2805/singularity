/**
 * The opening of the landing page's rebuild (pages/Genesis.tsx): the page arrives under a cover in the brand's gold
 * with the logo's tile at its centre, and the cover closes onto the tile to show the page already making itself
 * behind it - after the opening of a reference page the owner recorded and asked to have matched frame by frame.
 *
 * Handles: deciding, once, whether the opening plays at all - not under reduced motion, not on a load that is
 * already scrolled (a restored position) and not on a return from the sign-in pages by the page slide, where the
 * page arrives already made; holding the cover up until the web fonts are in (landing/intro.ts's fontsSettled, which
 * gives up after a moment) and for a short beat besides, so it reads as a state and not a flash; then letting the
 * sequence go, which every piece of the hero reads from the stage this provides (sequence.ts); and the cover itself
 * - a rounded square big enough to hide the screen (lib/opening.ts's coverSide), which shrinks to the size of the
 * tile on an ease-in-out, is a thin ring round the tile for a moment and is gone, the tile fading after it. Once the
 * tile has gone the cover is taken out of the page.
 *
 * The cover is laid out at its full size and scaled down, rather than laid out at the tile's size and scaled up, so
 * its edge is drawn sharp at the size it is seen for longest; its move is one animated transform and one opacity, so
 * it runs on the compositor while the page under it is still mounting. While it is held it takes the pointer, so
 * nothing under it can be clicked unseen; once it starts to close it lets the pointer through.
 *
 * The timetable is lib/opening.ts's (OPENING); the pieces behind the cover - the copy and the project window coming
 * up, and then the logo's eclipse, the window's film and the falling stars - are genesis/Hero.tsx's.
 */
import { useEffect, useState, type ReactNode } from "react";
import * as m from "motion/react-m";
import { HorizonMark } from "@/components/HorizonMark";
import { fontsSettled } from "@/components/landing/intro";
import { beat, COVER_EASE, coverSide, OPENING, TILE } from "@/lib/opening";
import { isSliding } from "@/lib/page-slide";
import { OpeningContext, type Stage } from "./sequence";

const TOP_SLACK = 40;
const SPARE = 1.05;

function plays() {
  if (typeof window === "undefined") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches && window.scrollY <= TOP_SLACK && !isSliding();
}

function Cover({ playing }: { playing: boolean }) {
  const [side] = useState(() => Math.ceil(coverSide(window.innerWidth, window.innerHeight) * SPARE));
  const [gone, setGone] = useState(false);
  if (gone) return null;

  return (
    <div aria-hidden="true" data-playing={playing} className="genesis-opening">
      <m.span
        className="genesis-cover"
        style={{ width: side, height: side }}
        initial={false}
        animate={playing ? { transform: `scale(${(TILE / side).toFixed(5)})`, opacity: [1, 1, 0] } : { transform: "scale(1)", opacity: 1 }}
        transition={{
          transform: { ...beat(OPENING.cover), ease: COVER_EASE },
          opacity: { ...beat(OPENING.cover), times: [0, ...OPENING.coverGone], ease: "linear" },
        }}
      />
      <m.span
        className="genesis-tile"
        style={{ width: TILE, height: TILE }}
        initial={false}
        animate={{ opacity: playing ? 0 : 1 }}
        transition={{ ...beat(OPENING.tile), ease: "linear" }}
        onAnimationComplete={() => playing && setGone(true)}
      >
        <HorizonMark className="h-12 w-12" />
      </m.span>
    </div>
  );
}

export function Opening({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<Stage>(() => (plays() ? "held" : "over"));

  useEffect(() => {
    if (stage !== "held") return;
    let cancelled = false;
    let frame = 0;
    const held = new Promise<void>((resolve) => window.setTimeout(resolve, OPENING.hold));
    Promise.all([held, fontsSettled()]).then(() => {
      if (cancelled) return;
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => setStage("playing"));
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [stage]);

  return (
    <OpeningContext.Provider value={stage}>
      {children}
      {stage !== "over" && <Cover playing={stage === "playing"} />}
    </OpeningContext.Provider>
  );
}
