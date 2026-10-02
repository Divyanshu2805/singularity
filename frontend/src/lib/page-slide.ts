/**
 * The slide between the landing page and the sign-in pages.
 *
 * Handles: running a navigation inside a page slide - the page on screen moves out to the left while the next one
 * follows it in from the right, and heading back to the landing page runs it the other way round, left to right -
 * deciding whether a navigation slides at all, and making the browser's Back and Forward buttons between the landing
 * page and the sign-in pages slide the same way.
 *
 * It is built on the browser's View Transitions: the old page is held as a snapshot while the router swaps the new one
 * in, and the slide itself is CSS (index.css, html.page-slide). The update waits until the destination page has
 * actually rendered - its root carries .landing-page or .auth-page - because both are loaded on demand, and sliding in
 * the empty Suspense fallback would show a blank page arriving. The wait polls on timers, not animation frames, since
 * the browser pauses rendering while a transition's update runs; READY_TIMEOUT_MS caps it, and a redirect that moves
 * the address on (a signed-in visitor sent from "/" to their projects) ends it too, so the screen is never held frozen.
 * The window is put back at the top once the new page is in, since the landing page may have been scrolled far down.
 *
 * Only navigations between "/" and /login or /signup slide; anything else, a browser without the API, and a visitor who
 * prefers reduced motion just navigate. A slide already running makes a second one navigate plainly rather than queue.
 *
 * For Back and Forward, the popstate event is held back from the router - this listener is added before the router's
 * own and in the capture phase, so it runs first - and sent on again from inside the slide, so the router swaps the
 * page while the old one is still pictured. isSliding() lets the landing page skip its opening sequence when it arrives
 * by a slide rather than a fresh load.
 */
const READY_TIMEOUT_MS = 3500;

const LANDING = ".landing-page";
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

export const isAuthPath = (path: string) => /^\/(login|signup)\/?$/.test(path);

export function isSliding() {
  return sliding;
}

export function canSlide() {
  const doc = document as DocumentWithTransitions;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return typeof doc.startViewTransition === "function" && !reduced && !sliding;
}

export function slideTo(to: string, go: () => unknown) {
  const target = new URL(to, window.location.href).pathname;
  const back = target === "/";
  if (!canSlide() || (!back && !isAuthPath(target))) {
    void go();
    return;
  }

  const destination = back ? LANDING : AUTH;
  const arrived = () => Boolean(document.querySelector(destination)) || window.location.pathname !== target;
  const root = document.documentElement;
  sliding = true;
  root.classList.add("page-slide");
  root.classList.toggle("page-slide-back", back);

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
      root.classList.remove("page-slide", "page-slide-back");
    });
}

const replayed = new WeakSet<Event>();
let historyInstalled = false;

export function slideOnHistoryMoves() {
  if (historyInstalled || typeof window === "undefined") return;
  historyInstalled = true;
  window.addEventListener(
    "popstate",
    (event) => {
      if (replayed.has(event) || !canSlide()) return;
      const to = window.location.pathname;
      const leavingAuth = Boolean(document.querySelector(AUTH));
      const leavingLanding = Boolean(document.querySelector(LANDING));
      if (!(leavingAuth && to === "/") && !(leavingLanding && isAuthPath(to))) return;

      event.stopImmediatePropagation();
      slideTo(to, () => {
        const again = new PopStateEvent("popstate", { state: event.state });
        replayed.add(again);
        window.dispatchEvent(again);
      });
    },
    true
  );
}
