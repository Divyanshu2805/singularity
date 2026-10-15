/**
 * The opening sequence the sign-in pages play on a first visit: the sky, the card rising, the mark, the headline's
 * words and the form's rows each arrive on their own beat of one clock, rather than all at once.
 *
 * Handles: the one clock every part of the sequence reads (INTRO's phases are milliseconds on it), deciding once per
 * page load whether the sequence plays at all, the entrances of the DOM pieces (singly, or each child of an element),
 * telling a component when a moment of the sequence has been reached, and hurrying the whole sequence to its end when
 * the visitor scrolls or presses a key.
 *
 * The pieces enter through the Web Animations API, so they run on the compositor as opacity and transform. Each is
 * created paused with a backwards fill in a layout effect, so nothing it hides is ever painted before the sequence
 * starts, and all of them start together on the first frame after mount. The clock counts document.timeline's frame
 * time, the clock the animations themselves run on, so the canvas sky and the DOM never drift apart.
 *
 * Nothing that holds a backdrop-filter is faded from an ancestor: an ancestor below full opacity becomes the filter's
 * backdrop root, so the glass would show unblurred for the whole fade. FADE_IN therefore gives only a starting
 * keyframe, pinned to offset 0, so each layer fades up to its own resting opacity; a lone keyframe without an offset is
 * taken as the end.
 *
 * The sequence waits for the web fonts (capped at FONT_WAIT_MS), so the headline never reflows mid-drop. A load that
 * is already scrolled, a page arriving by the page slide (lib/page-slide), reduced motion, or a browser without
 * element.animate gets no sequence, and every hook here then reports the finished state. useIntroClock takes
 * enabled = false for every sign-in page after the first in a visit, so moving between them doesn't replay it.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { isSliding } from "@/lib/page-slide";

type Phase = { at: number; for: number };

export const INTRO = {
  sky: { at: 150, for: 1300 },
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

export const WORD_DROP: Keyframe[] = [
  { opacity: 0, transform: "translate3d(0, -0.4em, 0)", filter: "blur(6px)" },
  { opacity: 1, transform: "translate3d(0, 0, 0)", filter: "blur(0px)" },
];

export const CONTENT_RISE: Keyframe[] = [
  { opacity: 0, translate: "0 12px" },
  { opacity: 1, translate: "0 0" },
];

export const FADE_IN: Keyframe[] = [{ opacity: 0, offset: 0 }];
