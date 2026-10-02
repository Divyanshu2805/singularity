/**
 * The small motion kit the landing page is built on.
 *
 * Handles: reading the reduced-motion preference and following it if it changes, knowing when an element is on
 * screen, knowing which of the page's sections the visitor is reading (useActiveSection - the one crossing a thin band
 * a little above the middle of the viewport, the later one where two meet, the one just passed across the empty
 * stretch between two sections, and none over the hero or the footer, which the navigation's section highlight
 * follows; an IntersectionObserver rather than a scroll listener, so it costs nothing per frame), tracking the pointer across a card as --mx/--my (followPointer, which the cards' glare
 * reads) and tilting a card towards it as --rx/--ry (tiltToPointer, for a mouse only and never under reduced motion,
 * and releaseTilt to let it settle back), playing a one-off entrance on a set of elements with an optional stagger
 * (play - the sign-in pages' and the app's headline drops and rises, which run outside the opening sequence's clock),
 * placing a gliding marker - the glass chip or the hover pill behind a row of links - over one of them (placeMarker,
 * shared by the navigation's section links and the feature stage's chapter rail: the link's own offsets are written to
 * the marker as custom properties, so moving between links is a CSS transition, and a marker that is appearing is
 * placed without one, data-snap, so it fades in where it lands instead of sliding in from wherever it last was),
 * a stopwatch that only runs while something is visible, the looping clock every card demo plays on (the
 * stopwatch, run only while that demo is on screen, not paused by an enclosing DemoPausedContext - which is how a
 * feature panel buried under the stack stops its demos, since being covered still counts as on screen - and pinned to
 * its end under reduced motion, or while an enclosing DemoTurnContext says it is not this demo's turn: the home
 * page's features play one film at a time in each row, the rest standing on their finished frame, and a demo tells
 * that context how long its film is so the turn can pass when it ends), the page's smooth scrolling, and gliding the page to a scroll position on request
 * (glideTo, which the feature fabric's planets use to jump to their feature - through Lenis while it is installed, so
 * the two never fight over the scroll, and natively otherwise).
 *
 * Every animated demo on the page is driven by elapsed time rather than chained timeouts, so pausing it (scrolled
 * away, or reduced motion) is just not advancing the clock, and a still frame is the clock pinned at its end.
 *
 * Smooth scrolling is Lenis easing the page's own native scroll, not a transformed wrapper, so sticky elements,
 * IntersectionObservers and the scroll-linked CSS variables all keep reading real scroll positions. In-page anchor
 * links are eased too, landing on each target's scroll-margin. They are caught here rather than by Lenis's own anchors
 * option, which scrolls without cancelling the click, so the browser's instant jump won. This replaces CSS
 * scroll-behavior: smooth, which fights Lenis. A scrollable panel inside the page scrolls itself rather than the page, and under reduced motion none of
 * this is installed, so the wheel and the anchors behave natively.
 */
import { createContext, useContext, useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { EASE_OUT } from "./intro";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia(REDUCED_QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(REDUCED_QUERY);
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function useInView<T extends Element>({ once = true, threshold = 0.15, rootMargin = "0px 0px -8% 0px" } = {}) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold, rootMargin }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [once, threshold, rootMargin]);

  return [ref, inView] as const;
}

function sectionJustPassed(ids: readonly string[]) {
  const line = window.innerHeight * 0.4;
  let passed: string | null = null;
  let ahead = false;
  for (const id of ids) {
    const rect = document.getElementById(id)?.getBoundingClientRect();
    if (!rect) continue;
    if (rect.bottom <= line) passed = id;
    else if (rect.top > line) ahead = true;
  }
  return ahead ? passed : null;
}

export function useActiveSection(ids: readonly string[]) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const crossing = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) crossing.add(entry.target.id);
          else crossing.delete(entry.target.id);
        }
        setActive([...ids].reverse().find((id) => crossing.has(id)) ?? sectionJustPassed(ids));
      },
      { rootMargin: "-38% 0px -58% 0px" }
    );
    ids.forEach((id) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, [ids]);

  return active;
}

export const STILL = Number.MAX_SAFE_INTEGER;

export function useStopwatch(running: boolean, still: boolean, loopMs?: number): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (still || !running) return;
    const start = performance.now();
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed(performance.now() - start), 80);
    return () => window.clearInterval(timer);
  }, [running, still]);

  if (still) return STILL;
  return loopMs ? elapsed % loopMs : elapsed;
}

export const DemoPausedContext = createContext(false);

export interface DemoTurn {
  playing: boolean;
  onLength?: (loopMs: number) => void;
}

export const DemoTurnContext = createContext<DemoTurn | null>(null);

export function useDemoClock(loopMs: number) {
  const reduced = usePrefersReducedMotion();
  const paused = useContext(DemoPausedContext);
  const turn = useContext(DemoTurnContext);
  const waiting = turn !== null && !turn.playing;
  const onLength = turn?.onLength;
  const [ref, visible] = useInView<HTMLDivElement>({ once: false, threshold: 0.3, rootMargin: "0px" });
  const t = useStopwatch(visible && !paused, reduced || waiting, loopMs);

  useEffect(() => {
    onLength?.(loopMs);
  }, [onLength, loopMs]);

  return [ref, t] as const;
}

export function followPointer(event: { currentTarget: HTMLElement; clientX: number; clientY: number }) {
  const node = event.currentTarget;
  const rect = node.getBoundingClientRect();
  node.style.setProperty("--mx", `${(((event.clientX - rect.left) / rect.width) * 100).toFixed(1)}%`);
  node.style.setProperty("--my", `${(((event.clientY - rect.top) / rect.height) * 100).toFixed(1)}%`);
}

export function tiltToPointer(event: { currentTarget: HTMLElement; clientX: number; clientY: number; pointerType: string }, degrees: number) {
  followPointer(event);
  if (event.pointerType !== "mouse" || window.matchMedia(REDUCED_QUERY).matches) return;
  const node = event.currentTarget;
  const rect = node.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  node.style.setProperty("--ry", `${((x - 0.5) * degrees * 2).toFixed(2)}deg`);
  node.style.setProperty("--rx", `${((0.5 - y) * degrees * 2).toFixed(2)}deg`);
}

export function releaseTilt(event: { currentTarget: HTMLElement }) {
  event.currentTarget.style.setProperty("--rx", "0deg");
  event.currentTarget.style.setProperty("--ry", "0deg");
}

export function placeMarker(marker: HTMLElement | null, link: HTMLElement | null | undefined, instant = false) {
  if (!marker) return;
  if (!link) {
    marker.dataset.shown = "false";
    return;
  }
  const snap = instant || marker.dataset.shown !== "true";
  if (snap) marker.dataset.snap = "true";
  marker.style.setProperty("--x", `${link.offsetLeft}px`);
  marker.style.setProperty("--y", `${link.offsetTop}px`);
  marker.style.setProperty("--w", `${link.offsetWidth}px`);
  marker.style.setProperty("--h", `${link.offsetHeight}px`);
  if (snap) {
    void marker.offsetWidth;
    marker.dataset.snap = "false";
  }
  marker.dataset.shown = "true";
}

export function play(elements: Iterable<Element>, keyframes: Keyframe[], { delay = 0, step = 0, duration = 650, easing = EASE_OUT } = {}) {
  if (typeof Element.prototype.animate !== "function" || window.matchMedia(REDUCED_QUERY).matches) return () => {};
  const running = Array.from(elements, (element, index) => {
    element.getAnimations().forEach((animation) => {
      if (!("animationName" in animation) && !("transitionProperty" in animation)) animation.finish();
    });
    return element.animate(keyframes, { duration, delay: delay + index * step, easing, fill: "backwards" });
  });
  return () => running.forEach((animation) => animation.cancel());
}

let pageScroll: Lenis | null = null;

export function glideTo(top: number) {
  if (pageScroll) pageScroll.scrollTo(top);
  else window.scrollTo({ top, behavior: window.matchMedia(REDUCED_QUERY).matches ? "auto" : "smooth" });
}

export function useSmoothScroll() {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const lenis = new Lenis({ autoRaf: true, allowNestedScroll: true, lerp: 0.1 });
    pageScroll = lenis;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href^='#']");
      const hash = link?.getAttribute("href");
      if (!hash || hash === "#") return;
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (!target) return;
      event.preventDefault();
      history.pushState(null, "", hash);
      lenis.scrollTo(target);
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      pageScroll = null;
      lenis.destroy();
    };
  }, [reduced]);
}
