/**
 * The page slides around signing in and out.
 *
 * Handles: running the sign-in navigation inside a page slide - the sign-in page moves out to the left while the app
 * follows it in from the right - and the sign-out slide, which runs the other way across a full document load.
 *
 * Signing in is built on the browser's View Transitions: the old page is held as a snapshot while the router swaps the
 * new one in, and the slide itself is CSS (index.css, html.page-slide). The update waits until the sign-in page is
 * gone and the page that replaced it is not the loading screen ([data-app-loading], AppLoading) - sliding in the
 * loading sky and then cutting to the dashboard was what made signing in look broken. The wait polls on timers, not
 * animation frames, since the browser pauses rendering while a transition's update runs; READY_TIMEOUT_MS caps it, so
 * the screen is never held frozen.
 *
 * Signing out is one slide: the app moves out to the right while the sign-in page follows it in from the left. It
 * leaves by a full document load on purpose (lib/session.ts - module-level state must not outlive an account), so the
 * slide is a cross-document view transition (index.css opts every same-origin load in; the pageswap listener turns
 * down each one but a sign-out's). slideOutThenGo marks the departure, and a session-storage flag carries it across
 * the load; on arrival (slideInFromLeft, installed before the first paint - the entry script is render-blocking in
 * index.html) the app's picture is held still with the new page unseen behind it (.page-arrive) until the sign-in page
 * has rendered, and only then do both move, driven from here on the transition's pseudo-elements. Browsers without
 * cross-document view transitions, and reduced motion, simply load the sign-in page.
 *
 * A browser without the API, a visitor who prefers reduced motion, and a slide already running just navigate.
 * isSliding() lets the sign-in page skip its opening sequence when it arrives by a slide rather than a fresh load.
 */
const READY_TIMEOUT_MS = 3500;

const AUTH = ".auth-page";

type ViewTransition = {
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
};

type DocumentWithTransitions = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => ViewTransition;
};

let sliding = false;

const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function waitUntil(ready: () => boolean) {
  const started = Date.now();
  await pause(30);
  while (!ready() && Date.now() - started < READY_TIMEOUT_MS) {
    await pause(40);
  }
  await pause(40);
}

export function isSliding() {
  return sliding;
}

function canSlide() {
  const doc = document as DocumentWithTransitions;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return typeof doc.startViewTransition === "function" && !reduced && !sliding;
}

export function slideTo(to: string, go: () => unknown) {
  if (!canSlide() || !document.querySelector(AUTH)) {
    void go();
    return;
  }

  const arrived = () =>
    !document.querySelector(AUTH) && !document.querySelector("[data-app-loading]") && Boolean(document.querySelector("#root > *:not(:empty)"));
  const root = document.documentElement;
  sliding = true;
  root.classList.add("page-slide");

  const transition = (document as DocumentWithTransitions).startViewTransition!(async () => {
    try {
      await go();
    } finally {
      await waitUntil(arrived);
      window.scrollTo(0, 0);
    }
  });
  transition.ready.catch(() => {});
  transition.finished
    .catch(() => {})
    .finally(() => {
      sliding = false;
      root.classList.remove("page-slide");
    });
}

const ARRIVAL_KEY = "slide_in_back";
const EASE = "cubic-bezier(0.76, 0, 0.24, 1)";
const SLIDE_MS = 700;
const ARRIVING = "page-arrive";

type CrossDocumentEvent = Event & { viewTransition: (ViewTransition & { skipTransition: () => void }) | null };

let leavingBySlide = false;

const crossDocumentSlides = () =>
  typeof window !== "undefined" &&
  "CSSViewTransitionRule" in window &&
  !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function slideOutThenGo(go: () => void) {
  if (crossDocumentSlides()) {
    try {
      sessionStorage.setItem(ARRIVAL_KEY, "1");
      leavingBySlide = true;
    } catch {
    }
  }
  go();
}

function takeArrivalFlag() {
  try {
    const flagged = sessionStorage.getItem(ARRIVAL_KEY) === "1";
    sessionStorage.removeItem(ARRIVAL_KEY);
    return flagged;
  } catch {
    return false;
  }
}

async function arriveFromLeft(transition: ViewTransition & { skipTransition: () => void }) {
  const root = document.documentElement;
  sliding = true;
  root.classList.add(ARRIVING);
  const settle = () => {
    sliding = false;
    root.classList.remove(ARRIVING);
  };
  transition.finished.then(settle, settle);
  try {
    await transition.ready;
  } catch {
    return;
  }
  await waitUntil(() => Boolean(document.querySelector(AUTH)));
  const options = { duration: SLIDE_MS, easing: EASE, fill: "forwards" as const };
  const leaving = root.animate({ transform: ["translateX(0)", "translateX(100%)"] }, { ...options, pseudoElement: "::view-transition-old(root)" });
  root.animate({ transform: ["translateX(-100%)", "translateX(0)"], opacity: [1, 1] }, { ...options, pseudoElement: "::view-transition-new(root)" });
  const end = () => transition.skipTransition();
  leaving.finished.then(end, end);
}

export function slideInFromLeft() {
  if (typeof window === "undefined") return () => {};
  const onSwap = (event: Event) => {
    const transition = (event as CrossDocumentEvent).viewTransition;
    if (transition && !leavingBySlide) transition.skipTransition();
  };
  const onReveal = (event: Event) => {
    const transition = (event as CrossDocumentEvent).viewTransition;
    const flagged = takeArrivalFlag();
    if (!transition) return;
    if (!flagged || !crossDocumentSlides()) {
      transition.skipTransition();
      return;
    }
    void arriveFromLeft(transition);
  };
  window.addEventListener("pageswap", onSwap);
  window.addEventListener("pagereveal", onReveal);
  return () => {
    window.removeEventListener("pageswap", onSwap);
    window.removeEventListener("pagereveal", onReveal);
  };
}
