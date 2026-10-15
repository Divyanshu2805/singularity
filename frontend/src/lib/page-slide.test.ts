/**
 * Covers when the page slide runs and how it cleans up: signing in slides only from a sign-in page and only where
 * the browser has View Transitions, the navigation always happens even when nothing slides, a second slide while one
 * runs just navigates, and the root's classes come off once it finishes; signing in waits past the loading screen;
 * and signing out slides across its page load only when it is a sign-out,
 * holding the app's picture until the sign-in page has rendered, then sliding both and ending the transition.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Transition = { finished: Promise<void>; ready: Promise<void>; updateCallbackDone: Promise<void> };

let finish: () => void;
let update: Promise<void>;

function stubViewTransitions() {
  const start = vi.fn((callback: () => Promise<void> | void) => {
    update = Promise.resolve(callback());
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { finished, ready: Promise.resolve(), updateCallbackDone: update } satisfies Transition;
  });
  Object.defineProperty(document, "startViewTransition", { configurable: true, writable: true, value: start });
  return start;
}

async function loadModule() {
  vi.resetModules();
  return import("./page-slide");
}

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.className = "";
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (document as { startViewTransition?: unknown }).startViewTransition;
});

describe("slideTo", () => {
  it("just navigates where the browser has no View Transitions", async () => {
    const { slideTo } = await loadModule();
    document.body.innerHTML = '<div class="auth-page"></div>';
    const go = vi.fn();
    slideTo("/projects", go);
    expect(go).toHaveBeenCalledOnce();
    expect(document.documentElement.classList.contains("page-slide")).toBe(false);
  });

  it("just navigates from anywhere but a sign-in page", async () => {
    const start = stubViewTransitions();
    const { slideTo } = await loadModule();
    const go = vi.fn();
    slideTo("/pricing", go);
    expect(go).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });

  it("slides from the sign-in page into the app, then takes its classes off when it finishes", async () => {
    const start = stubViewTransitions();
    const { slideTo, isSliding } = await loadModule();
    document.body.innerHTML = '<div id="root"><div class="auth-page"></div></div>';
    const go = vi.fn(() => {
      document.getElementById("root")!.innerHTML = "<main>projects</main>";
    });

    slideTo("/projects", go);
    const root = document.documentElement;
    expect(start).toHaveBeenCalledOnce();
    expect(go).toHaveBeenCalledOnce();
    expect(root.classList.contains("page-slide")).toBe(true);
    expect(isSliding()).toBe(true);

    await vi.runAllTimersAsync();
    await update;
    finish();
    await vi.runAllTimersAsync();
    expect(root.className).toBe("");
    expect(isSliding()).toBe(false);
  });

  it("navigates plainly rather than queueing a second slide while one runs", async () => {
    const start = stubViewTransitions();
    const { slideTo } = await loadModule();
    document.body.innerHTML = '<div class="auth-page"></div>';
    slideTo("/projects", vi.fn());
    const second = vi.fn();
    slideTo("/projects", second);
    expect(start).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });
});

describe("signing in", () => {
  it("keeps the sign-in page pictured until the page that replaced it is not the loading screen", async () => {
    stubViewTransitions();
    const { slideTo } = await loadModule();
    document.body.innerHTML = '<div id="root"><div class="auth-page">form</div></div>';
    let settled = false;
    slideTo("/projects", () => {
      document.getElementById("root")!.innerHTML = '<div data-app-loading="">loading</div>';
    });
    void update.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(500);
    expect(settled).toBe(false);
    document.getElementById("root")!.innerHTML = "<main>projects</main>";
    await vi.advanceTimersByTimeAsync(200);
    expect(settled).toBe(true);
  });
});

describe("signing out", () => {
  type Held = { ready: Promise<void>; finished: Promise<void>; updateCallbackDone: Promise<void>; skipTransition: ReturnType<typeof vi.fn> };

  function crossDocument() {
    Object.defineProperty(window, "CSSViewTransitionRule", { configurable: true, writable: true, value: class {} });
  }

  function held(): Held {
    return { ready: Promise.resolve(), finished: new Promise<void>(() => {}), updateCallbackDone: Promise.resolve(), skipTransition: vi.fn() };
  }

  function fire(type: "pageswap" | "pagereveal", viewTransition: Held | null) {
    const event = new Event(type);
    Object.defineProperty(event, "viewTransition", { value: viewTransition });
    window.dispatchEvent(event);
  }

  let uninstall = () => {};

  afterEach(() => {
    uninstall();
    uninstall = () => {};
    delete (window as { CSSViewTransitionRule?: unknown }).CSSViewTransitionRule;
    sessionStorage.clear();
  });

  it("just leaves, and marks nothing, where the browser cannot slide across a page load", async () => {
    const { slideOutThenGo } = await loadModule();
    const go = vi.fn();
    slideOutThenGo(go);
    expect(go).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem("slide_in_back")).toBeNull();
  });

  it("turns down a page load's transition unless it is a sign-out", async () => {
    crossDocument();
    const { slideInFromLeft, slideOutThenGo } = await loadModule();
    uninstall = slideInFromLeft();
    const other = held();
    fire("pageswap", other);
    expect(other.skipTransition).toHaveBeenCalledOnce();

    slideOutThenGo(vi.fn());
    const signOut = held();
    fire("pageswap", signOut);
    expect(signOut.skipTransition).not.toHaveBeenCalled();
  });

  it("shows a page that was not reached by signing out at once", async () => {
    crossDocument();
    const { slideInFromLeft } = await loadModule();
    uninstall = slideInFromLeft();
    const arrival = held();
    fire("pagereveal", arrival);
    expect(arrival.skipTransition).toHaveBeenCalledOnce();
  });

  it("holds the app's picture until the sign-in page has rendered, then slides both and ends", async () => {
    crossDocument();
    const animations: { keyframes: unknown; pseudoElement?: string }[] = [];
    const ends: (() => void)[] = [];
    const animate = vi.fn((keyframes: unknown, options: { pseudoElement?: string }) => {
      animations.push({ keyframes, pseudoElement: options.pseudoElement });
      return { finished: new Promise<void>((resolve) => ends.push(resolve)) };
    });
    Object.defineProperty(document.documentElement, "animate", { configurable: true, value: animate });
    sessionStorage.setItem("slide_in_back", "1");
    const { slideInFromLeft, isSliding } = await loadModule();
    uninstall = slideInFromLeft();
    const arrival = held();
    fire("pagereveal", arrival);

    expect(document.documentElement.classList.contains("page-arrive")).toBe(true);
    expect(isSliding()).toBe(true);
    expect(sessionStorage.getItem("slide_in_back")).toBeNull();
    await vi.advanceTimersByTimeAsync(400);
    expect(animate).not.toHaveBeenCalled();

    document.body.innerHTML = '<div class="auth-page">form</div>';
    await vi.advanceTimersByTimeAsync(200);
    expect(animations.map((a) => a.pseudoElement)).toEqual(["::view-transition-old(root)", "::view-transition-new(root)"]);
    expect(arrival.skipTransition).not.toHaveBeenCalled();
    ends.forEach((end) => end());
    await vi.advanceTimersByTimeAsync(0);
    expect(arrival.skipTransition).toHaveBeenCalledOnce();
    delete (document.documentElement as { animate?: unknown }).animate;
  });
});
