/**
 * The new landing page's opening journey: the hero, the app's window rising from behind the planet's horizon, and the
 * five steps of how it works, played on one pinned stage - or, where pinning would not suit, the hero and the steps as
 * two plain sections.
 *
 * Handles, on a wide enough and tall enough screen without reduced motion (PIN), one section several screens tall
 * whose stage sticks to the viewport while the scroll drives everything on it (lib/journey's beats, through
 * lib/scroll-scene, writing transforms straight onto the elements so a scroll never re-renders the stage):
 * - the hero as it opens - the eclipse over the planet's night side (Corona), the headline and the prompt (HeroCopy);
 * - the window rising (MOONRISE): the app's window (StepWindow) comes up from behind the horizon at full size, cut
 *   along the limb's curve (limbClip) so it reads as rising from behind the planet rather than sliding up a page,
 *   while the headline and the prompt lift away and fade, and the corona dims a little behind it;
 * - the window docking (DOCK, overlapping the rise so nothing stops between them): it moves to the right and settles
 *   to its working size while the planet sinks out of the bottom of the screen, as a camera tilting up off the
 *   horizon would see it, and the eclipse's light goes with it; the steps (Steps) come in on the left;
 * - the steps: each one plays its stretch of the app's screens in the window, scrubbed by the scroll (story.ts maps
 *   a step's progress to a screen and a moment on it), while its instrument acts it out under the list and the
 *   window's hairline and the list's track fill with the journey's progress. Scrolling back rewinds all of it;
 * - the pull-back (TAIL): once the last step has played, the camera draws back - the window shrinks a little about its
 *   centre (PULL_BACK) and, with the steps, dims (PULL_DIM) as they lift away - so the stage hands over to the features
 *   rather than stopping and being scrolled off.
 * The section carries an anchor (#how) placed where the steps begin, which the navigation's link and the hero's "See
 * how it works" glide to and the navigation's highlight follows.
 *
 * Elsewhere (a phone, a short window, reduced motion) it renders the standalone Hero, then the steps as a section of
 * their own: the same list, instrument and window, played on a clock while they are on screen (stepOnClock) - or,
 * under reduced motion, standing on the last step, finished.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Corona } from "@/components/cosmos/Corona";
import { CAPTIONS } from "@/components/cosmos/instruments";
import { eclipseGeometry, limbAt, type EclipseScene } from "@/components/cosmos/eclipse";
import { STILL, useInView, usePrefersReducedMotion, useStopwatch } from "@/components/landing/motion";
import { DOCK, JOURNEY_SCREENS, MOONRISE, STEPS_FROM, STEPS_LENGTH, blendRect, gutterFor, limbClip, phase, stepAt, windowRects } from "@/lib/journey";
import { easeInOut, easeOut, span, useScrollScene } from "@/lib/scroll-scene";
import { HeroCopy, Hero } from "./Hero";
import { StepWindow } from "./StepWindow";
import { Steps, type Caption } from "./Steps";
import { STORY, createTicker, sceneFor, stepOnClock } from "./story";

const PIN = "(min-width: 1024px) and (min-height: 700px)";
const PULL_BACK = 0.1;
const PULL_DIM = 0.55;

function usePinned() {
  const reduced = usePrefersReducedMotion();
  const [fits, setFits] = useState(() => typeof window !== "undefined" && window.matchMedia(PIN).matches);

  useEffect(() => {
    const query = window.matchMedia(PIN);
    const update = () => setFits(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return fits && !reduced;
}

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));

  useEffect(() => {
    const update = () => setSize((current) => (current.w === window.innerWidth && current.h === window.innerHeight ? current : { w: window.innerWidth, h: window.innerHeight }));
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return size;
}

function PinnedJourney() {
  const sectionRef = useRef<HTMLElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const railRef = useRef<HTMLSpanElement>(null);
  const scene = useRef<EclipseScene>({ dim: 0, sink: 0 });
  const progress = useRef(0);
  const ticker = useMemo(createTicker, []);
  const size = useViewport();
  const rects = useMemo(() => windowRects(size.w, size.h), [size]);
  const geometry = useMemo(() => eclipseGeometry(size.w, size.h), [size]);
  const [active, setActive] = useState(0);
  const [caption, setCaption] = useState<Caption>(() => CAPTIONS[0](0));
  const shown = useRef({ step: 0, caption });

  useScrollScene(sectionRef, (frame) => {
    const height = frame.viewport;
    const screens = Math.max(0, -frame.top / height);
    const rise = easeInOut(phase(screens, MOONRISE));
    const dock = easeInOut(phase(screens, DOCK));
    const back = easeInOut(phase(screens, { from: STEPS_FROM + STEPS_LENGTH, to: JOURNEY_SCREENS }));
    const sink = height * (0.07 * rise + 0.92 * dock);
    scene.current.sink = sink;
    scene.current.dim = Math.min(1, 0.3 * rise + 0.75 * dock);

    const step = stepAt(screens);
    const fraction = step.started ? step.fraction : 0;
    const dots = stepsRef.current?.querySelectorAll<HTMLElement>(".ln-step-dot");
    let railScale = 0;
    if (dots && dots.length > 1) {
      const first = dots[0].offsetTop;
      const last = dots[dots.length - 1].offsetTop;
      const here = dots[step.index].offsetTop;
      const next = dots[Math.min(dots.length - 1, step.index + 1)].offsetTop;
      railScale = last > first ? (here + (next - here) * (step.index === dots.length - 1 ? 0 : fraction) - first) / (last - first) : 0;
    }

    const copy = copyRef.current;
    if (copy) {
      const fade = 1 - span(rise, 0.04, 0.5);
      copy.style.transform = `translate3d(0, ${(-0.26 * height * rise * rise).toFixed(1)}px, 0)`;
      copy.style.opacity = fade.toFixed(3);
      copy.style.visibility = fade <= 0.001 ? "hidden" : "";
      copy.style.pointerEvents = fade < 0.5 ? "none" : "";
    }

    const win = windowRef.current;
    if (win) {
      const { centred, docked } = rects;
      const limb = limbAt(geometry, geometry.centerX, sink);
      const placed = blendRect(blendRect({ ...centred, y: limb + 18 }, centred, rise), docked, dock);
      const shrink = 1 - PULL_BACK * back;
      const rect = { x: placed.x + (placed.w * (1 - shrink)) / 2, y: placed.y + (placed.h * (1 - shrink)) / 2, w: placed.w * shrink, h: placed.h * shrink };
      win.style.transform = `translate3d(${rect.x.toFixed(1)}px, ${rect.y.toFixed(1)}px, 0) scale(${(rect.w / centred.w).toFixed(4)})`;
      win.style.clipPath = limbClip(rect, centred, (x) => limbAt(geometry, x, sink));
      win.style.opacity = (1 - PULL_DIM * back).toFixed(3);
      win.style.visibility = rise <= 0.001 ? "hidden" : "";
    }

    const steps = stepsRef.current;
    if (steps) {
      const show = easeOut(span(dock, 0.3, 1));
      steps.style.opacity = (show * (1 - PULL_DIM * back)).toFixed(3);
      steps.style.transform = `translate3d(${(-28 * (1 - show)).toFixed(1)}px, ${(-36 * back).toFixed(1)}px, 0)`;
      steps.style.visibility = show <= 0.001 ? "hidden" : "";
    }

    progress.current = fraction;
    const moment = sceneFor(step.index, fraction);
    ticker.set(step.index, moment.scene, moment.t);
    if (barRef.current) barRef.current.style.transform = `scaleX(${step.overall.toFixed(4)})`;
    if (railRef.current) railRef.current.style.transform = `scaleY(${Math.min(1, Math.max(0, railScale)).toFixed(4)})`;
    if (step.index !== shown.current.step) {
      shown.current.step = step.index;
      setActive(step.index);
    }
    const next = CAPTIONS[step.index](fraction);
    if (next.title !== shown.current.caption.title || next.detail !== shown.current.caption.detail) {
      shown.current.caption = next;
      setCaption(next);
    }
  });

  const gutter = gutterFor(size.w);

  return (
    <section ref={sectionRef} aria-label="Singularity" className="ln-journey relative" style={{ height: `${(1 + JOURNEY_SCREENS) * 100}vh` }}>
      <div id="how" aria-hidden="true" className="pointer-events-none absolute inset-x-0" style={{ top: `${STEPS_FROM * 100}vh`, height: `${(STEPS_LENGTH + 1) * 100}vh` }} />
      <div className="sticky top-0 h-screen overflow-hidden">
        <Corona scene={scene} className="inset-0" />
        <HeroCopy ref={copyRef} className="will-change-transform" />
        <div
          ref={stepsRef}
          className="absolute z-20 flex flex-col justify-center"
          style={{ left: gutter, width: Math.max(320, rects.docked.x - gutter - 56), top: 76, bottom: 20, visibility: "hidden" }}
        >
          <Steps active={active} caption={caption} progress={progress} railRef={railRef} />
        </div>
        <StepWindow
          ref={windowRef}
          ticker={ticker}
          barRef={barRef}
          className="pointer-events-none absolute left-0 top-0 z-30 origin-top-left will-change-transform"
          style={{ width: rects.centred.w, height: rects.centred.h, visibility: "hidden" }}
        />
      </div>
    </section>
  );
}

function StackedSteps() {
  const [ref, visible] = useInView<HTMLElement>({ once: false, threshold: 0.15, rootMargin: "0px" });
  const reduced = usePrefersReducedMotion();
  const elapsed = useStopwatch(visible, reduced);
  const clock = elapsed === STILL ? { index: STORY.length - 1, fraction: 1 } : stepOnClock(elapsed);
  const progress = useRef(clock.fraction);
  progress.current = clock.fraction;
  const ticker = useMemo(createTicker, []);
  const barRef = useRef<HTMLSpanElement>(null);
  const moment = sceneFor(clock.index, clock.fraction);
  const overall = (clock.index + clock.fraction) / STORY.length;

  useEffect(() => {
    ticker.set(clock.index, moment.scene, moment.t);
    if (barRef.current) barRef.current.style.transform = `scaleX(${overall.toFixed(4)})`;
  }, [ticker, clock.index, moment.scene, moment.t, overall]);

  return (
    <section id="how" ref={ref} className="landing-wrap relative scroll-mt-20 py-20 sm:py-28">
      <div className="grid gap-10 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] md:items-center">
        <Steps active={clock.index} caption={CAPTIONS[clock.index](clock.fraction)} progress={progress} />
        <div className="relative aspect-[1/0.7] w-full">
          <StepWindow ticker={ticker} barRef={barRef} className="pointer-events-none absolute inset-0" />
        </div>
      </div>
    </section>
  );
}

export function Journey() {
  const pinned = usePinned();

  if (pinned) return <PinnedJourney />;
  return (
    <>
      <Hero />
      <StackedSteps />
    </>
  );
}
