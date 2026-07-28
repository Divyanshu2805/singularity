/**
 * What every test file gets before it runs.
 *
 * Handles: the DOM matchers, a stub for the media-query API jsdom does not implement, and a no-op resize observer.
 *
 * The resize observer matters: anything rendering the sliding overflow text - the sidebar's project names, the chat
 * rail's labels - observes its own width with one, and without a stub those components cannot mount. Treating "never
 * measured" as "text fits" is the right default when there is no layout anyway.
 */
import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;
