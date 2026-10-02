/**
 * Covers when the page slide runs and how it cleans up: only between the landing page and the sign-in pages, only where
 * the browser has View Transitions, going home runs it the other way round, the navigation always happens even when
 * nothing slides, a second slide while one runs just navigates, and the root's classes come off once it finishes.
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

describe("isAuthPath", () => {
  it("knows the two sign-in routes and nothing else", async () => {
    const { isAuthPath } = await loadModule();
    expect(isAuthPath("/login")).toBe(true);
    expect(isAuthPath("/signup/")).toBe(true);
    expect(isAuthPath("/pricing")).toBe(false);
    expect(isAuthPath("/login/extra")).toBe(false);
  });
});

describe("slideTo", () => {
  it("just navigates where the browser has no View Transitions", async () => {
    const { slideTo } = await loadModule();
    const go = vi.fn();
    slideTo("/signup", go);
    expect(go).toHaveBeenCalledOnce();
    expect(document.documentElement.classList.contains("page-slide")).toBe(false);
  });

  it("just navigates to anywhere other than home or the sign-in pages", async () => {
    const start = stubViewTransitions();
    const { slideTo } = await loadModule();
    const go = vi.fn();
    slideTo("/pricing", go);
    expect(go).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });

  it("slides forwards to the sign-in page, then takes its classes off when it finishes", async () => {
    const start = stubViewTransitions();
    const { slideTo, isSliding } = await loadModule();
    const go = vi.fn(() => {
      window.history.pushState(null, "", "/signup");
      document.body.innerHTML = '<div class="auth-page"></div>';
    });

    slideTo("/signup", go);
    const root = document.documentElement;
    expect(start).toHaveBeenCalledOnce();
    expect(go).toHaveBeenCalledOnce();
    expect(root.classList.contains("page-slide")).toBe(true);
    expect(root.classList.contains("page-slide-back")).toBe(false);
    expect(isSliding()).toBe(true);

    await vi.runAllTimersAsync();
    await update;
    finish();
    await vi.runAllTimersAsync();
    expect(root.className).toBe("");
    expect(isSliding()).toBe(false);
  });

  it("runs the other way round going home", async () => {
    stubViewTransitions();
    const { slideTo } = await loadModule();
    slideTo("/", vi.fn());
    expect(document.documentElement.classList.contains("page-slide-back")).toBe(true);
  });

  it("navigates plainly rather than queueing a second slide while one runs", async () => {
    const start = stubViewTransitions();
    const { slideTo } = await loadModule();
    slideTo("/signup", vi.fn());
    const second = vi.fn();
    slideTo("/login", second);
    expect(start).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it("stops waiting once a redirect moves the address on, rather than holding the screen", async () => {
    stubViewTransitions();
    const { slideTo } = await loadModule();
    slideTo("/", () => window.history.pushState(null, "", "/projects"));
    await vi.advanceTimersByTimeAsync(200);
    await update;
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
