/**
 * The landing page's opening sequence: on a load at the top of the page the hero is not simply there, it is made,
 * each piece on its own beat. On an empty sky light breaks along the crest of the nebula's nearest ridge like a dawn,
 * spreading outwards from the centre (INTRO.light), with the stars coming up behind it; the steam and the cavity's
 * glow rise after it (INTRO.steam). While the light spreads, the glass card opens downwards from its top edge just
 * under that crest, unrolling to its foot alongside the dawn rather than after it (a card that waited read as two
 * separate steps), the headline drops in word by word from above and the navigation pill
 * follows it down, its items arriving left to right. Then the card's panels cascade in. Only then does the page go live (INTRO.live): the
 * card's session starts and the ambient loops the sequence held back begin. Every entrance eases in and out on long,
 * overlapping curves, so nothing arrives all at once.
 *
 * Handles: the one clock every part of the sequence reads (INTRO's phases are milliseconds on it), deciding once per
 * page load whether the sequence plays at all, the entrances of the DOM pieces - singly, or staggered across the
 * matches of a selector (useIntroStagger) - telling a component when a moment of the sequence has been reached, and
 * hurrying the whole sequence to its end when the visitor scrolls or presses a key.
 *
 * Entrances on elements that already carry a transform of their own (the nav items, the
 * card's panels) animate the individual translate and scale properties rather than transform, which compose with the
 * element's own transform instead of replacing it for the length of the animation.
 *
 * The DOM pieces enter through the Web Animations API rather than per-frame style writes, so they run on the
 * compositor, as opacity and transform - only the headline's words add a small blur, since a blur animated on the
 * card's large panels or on the navigation items cost a re-rasterised layer every frame and made the opening stutter. Each is created paused with a backwards fill in a layout
 * effect, so nothing it hides is ever painted before the sequence starts, and all of them start together on the first
 * frame after mount - begin() - so the page's own mount work never eats into the opening. The hero's nebula
 * (HeroNebula) reads the same clock every frame in its shader loop, which is what keeps the card's entrance in step
 * with the light breaking above it. Until 2026-10-03 that was a black hole opening out of a line of light, with orbit
 * circles drawing on and its light racing along the card's edge (INTRO's old line, open, orbits and rays phases). The clock counts document.timeline's frame time, the very clock the animations run on, rather than
 * performance.now(), so a slow first frame can't set the light and the DOM apart.
 *
 * Nothing that holds a backdrop-filter is ever faded from an ancestor: an ancestor below full opacity becomes the
 * filter's backdrop root, so the glass would show unblurred for the whole fade and snap to frosted at its end. The
 * card's wrapper therefore only moves, and each of the card's own layers fades itself (useIntroChildrenEntrance); the
 * navigation pill fades itself too. FADE_IN gives only a starting keyframe, pinned to offset 0, so each layer fades up
 * to its own resting opacity - the sky's grain rests at 7%, and a fade to 1 turned the whole sky grey until it ended.
 * The offset has to be explicit: a lone keyframe without one is taken as the end, which faded the card out instead.
 *
 * The sequence waits for the web fonts before it begins (fontsSettled, capped at FONT_WAIT_MS so a slow font network
 * never holds the page black for long). The fonts load with display=swap, so on a first visit they used to arrive
 * partway through the opening: the headline reflowed mid-drop and the card and the hero's light below it jumped. While
 * it waits everything is held at its backwards fill, so the wait is only a moment more of the empty sky.
 *
 * The entrances run on long, gentle curves over short distances - the words drop 0.4em through a 6px blur, the
 * navigation 36px, the card's panels 12px - each over most of a second, with the staggers widened to match; the
 * shorter, further moves they replaced landed in quick succession and read as busy rather than smooth.
 *
 * The browser restores a reloaded page's scroll position after the first render, so a clock can be made at the top
 * and find itself mid-page by the time it would start; begin() is then skip() instead, finishing everything at once.
 *
 * Hurrying re-times the rest of the sequence to finish in HURRY_MS: the clock's rate goes up and every running
 * animation's playback rate goes up with it, so the light and the DOM stay in step even while hurried. A load that is
 * already scrolled (a restored scroll position), a return from the sign-in pages by the page slide (lib/page-slide - the
 * page arrives already made, rather than opening while it slides in), reduced motion, or a browser without
 * element.animate gets no sequence, and every hook here then reports the finished state.
 *
 * The sign-in pages run an opening of their own on this same clock - the sky, their card rising, their mark, their
 * headline's words and the form's rows - and pass enabled = false to useIntroClock for
 * every sign-in page after the first in a visit, so moving between them doesn't replay it.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { isSliding } from "@/lib/page-slide";

type Phase = { at: number; for: number };

export const INTRO = {
  light: { at: 120, for: 1500 },
  sky: { at: 150, for: 1300 },
  card: { at: 380, for: 1150 },
  steam: { at: 700, for: 1600 },
  headline: { at: 820, for: 1000 },
  wordStep: 55,
  nav: { at: 1000, for: 900 },
  navStep: 50,
  content: { at: 1300, for: 800 },
  contentStep: 80,
  live: 2550,
  end: 2600,
} as const;

const HURRY_MS = 450;
const FONT_WAIT_MS = 700;

function fontsSettled() {
  const fonts = typeof document === "undefined" ? undefined : document.fonts;
  if (!fonts) return Promise.resolve();
  return Promise.race([fonts.ready.then(() => undefined), new Promise<void>((resolve) => window.setTimeout(resolve, FONT_WAIT_MS))]);
}

const frameTime = () => {
  const time = document.timeline?.currentTime;
  return typeof time === "number" ? time : performance.now();
};
const TOP_SLACK = 40;

export const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

export class IntroClock {
  private base = 0;
  private baseAt = 0;
  private rate = 1;
  private started = false;
  private animations = new Set<Animation>();
  private listeners = new Set<() => void>();

  elapsed() {
    return this.started ? this.base + (frameTime() - this.baseAt) * this.rate : 0;
  }

  get speed() {
    return this.rate;
  }

  get done() {
    return this.elapsed() >= INTRO.end;
  }

  progress({ at, for: duration }: Phase) {
    return Math.min(1, Math.max(0, (this.elapsed() - at) / duration));
  }

  begin() {
    if (this.started) return;
    this.started = true;
    this.baseAt = frameTime();
    this.animations.forEach((animation) => animation.play());
    this.notify();
  }

  skip() {
    this.started = true;
    this.base = INTRO.end;
    this.baseAt = frameTime();
    this.animations.forEach((animation) => animation.finish());
    this.animations.clear();
    this.notify();
  }

  hurry() {
    const now = this.elapsed();
    if (!this.started || this.rate > 1 || now >= INTRO.end) return;
    this.base = now;
    this.baseAt = frameTime();
    this.rate = Math.max(1, (INTRO.end - now) / HURRY_MS);
    this.animations.forEach((animation) => animation.updatePlaybackRate(this.rate));
    this.notify();
  }

  animate(element: Element, keyframes: Keyframe[], { at, for: duration }: Phase, easing: string) {
    const animation = element.animate(keyframes, { delay: at - this.elapsed(), duration, easing, fill: "backwards" });
    if (this.rate !== 1) animation.updatePlaybackRate(this.rate);
    if (!this.started) animation.pause();
    this.animations.add(animation);
    animation.addEventListener("finish", () => this.animations.delete(animation));
    return () => {
      this.animations.delete(animation);
      animation.cancel();
    };
  }

  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }
}

export const IntroContext = createContext<IntroClock | null>(null);

export function useIntro() {
  return useContext(IntroContext);
}

export function useIntroClock(enabled = true): IntroClock | null {
  const [clock] = useState(() => {
    if (!enabled || typeof window === "undefined" || typeof Element.prototype.animate !== "function") return null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || window.scrollY > TOP_SLACK || isSliding()) return null;
    return new IntroClock();
  });

  useEffect(() => {
    if (!clock) return;
    let frame = 0;
    let cancelled = false;
    fontsSettled().then(() => {
      if (cancelled) return;
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => (window.scrollY > TOP_SLACK ? clock.skip() : clock.begin()));
      });
    });
    const hurry = () => clock.hurry();
    const onScroll = () => window.scrollY > TOP_SLACK && hurry();
    const options = { passive: true } as const;
    window.addEventListener("wheel", hurry, options);
    window.addEventListener("touchmove", hurry, options);
    window.addEventListener("keydown", hurry);
    window.addEventListener("scroll", onScroll, options);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("wheel", hurry);
      window.removeEventListener("touchmove", hurry);
      window.removeEventListener("keydown", hurry);
      window.removeEventListener("scroll", onScroll);
    };
  }, [clock]);

  return clock;
}

export function useIntroEntrance(ref: RefObject<Element>, keyframes: Keyframe[], phase: Phase, easing = EASE_OUT) {
  const clock = useIntro();

  useLayoutEffect(() => {
    const element = ref.current;
    if (!clock || !element || clock.done) return;
    return clock.animate(element, keyframes, phase, easing);
  }, [clock, ref, keyframes, phase, easing]);
}

export function useIntroChildrenEntrance(ref: RefObject<Element>, keyframes: Keyframe[], phase: Phase, easing = EASE_OUT) {
  const clock = useIntro();

  useLayoutEffect(() => {
    const element = ref.current;
    if (!clock || !element || clock.done) return;
    const stops = Array.from(element.children, (child) => clock.animate(child, keyframes, phase, easing));
    return () => stops.forEach((stop) => stop());
  }, [clock, ref, keyframes, phase, easing]);
}

export function useIntroStagger(ref: RefObject<Element>, selector: string, keyframes: Keyframe[], phase: Phase, step: number, easing = EASE_OUT) {
  const clock = useIntro();

  useLayoutEffect(() => {
    const root = ref.current;
    if (!clock || !root || clock.done) return;
    const stops = Array.from(root.querySelectorAll(selector), (element, index) =>
      clock.animate(element, keyframes, { at: phase.at + index * step, for: phase.for }, easing)
    );
    return () => stops.forEach((stop) => stop());
  }, [clock, ref, selector, keyframes, phase, step, easing]);
}

export function useIntroReached(at: number) {
  const clock = useIntro();
  const [reached, setReached] = useState(() => !clock || clock.elapsed() >= at);

  useEffect(() => {
    if (!clock || reached) return;
    let timer = 0;
    const check = () => {
      if (clock.elapsed() >= at - 1) setReached(true);
      else schedule();
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(check, Math.max(16, (at - clock.elapsed()) / clock.speed));
    };
    schedule();
    const off = clock.onChange(schedule);
    return () => {
      window.clearTimeout(timer);
      off();
    };
  }, [clock, at, reached]);

  return reached;
}

export const EASE_UNROLL = "cubic-bezier(0.45, 0, 0.2, 1)";

export const CARD_UNFOLD: Keyframe[] = [
  { clipPath: "inset(-64px -64px 100% -64px)", offset: 0 },
  { clipPath: "inset(-64px -64px -64px -64px)" },
];

export const CARD_RISE: Keyframe[] = [
  { transform: "translate3d(0, 64px, 0) scale(0.97)" },
  { transform: "translate3d(0, 0, 0) scale(1)" },
];

export const WORD_DROP: Keyframe[] = [
  { opacity: 0, transform: "translate3d(0, -0.4em, 0)", filter: "blur(6px)" },
  { opacity: 1, transform: "translate3d(0, 0, 0)", filter: "blur(0px)" },
];

export const NAV_DROP: Keyframe[] = [
  { opacity: 0, transform: "translate3d(0, -36px, 0) scale(0.98)" },
  { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
];

export const ITEM_DROP: Keyframe[] = [
  { opacity: 0, translate: "0 -12px" },
  { opacity: 1, translate: "0 0" },
];

export const CONTENT_RISE: Keyframe[] = [
  { opacity: 0, translate: "0 12px" },
  { opacity: 1, translate: "0 0" },
];


export const FADE_IN: Keyframe[] = [{ opacity: 0, offset: 0 }];
