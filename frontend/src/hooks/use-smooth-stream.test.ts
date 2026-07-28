/**
 * Covers the smooth reveal of streamed text: resuming an in-progress reveal across a remount rather than retyping
 * from the start, starting fresh for an unknown key, forgetting progress once a stream is over, and behaving as a
 * plain reveal when no key is given.
 *
 * Also covers reattaching to a response already under way: the backlog appears at once and only what arrives
 * afterwards is typed out, and the reveal never runs past a tag that has only half arrived.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSmoothStream } from "./use-smooth-stream";

function stubAnimationFrame() {
  let now = 0;
  let pending: FrameRequestCallback | null = null;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    pending = cb;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    pending = null;
  });
  vi.spyOn(performance, "now").mockImplementation(() => now);
  return {
    advance(ms: number) {
      now += ms;
      const cb = pending;
      pending = null;
      cb?.(now);
    },
  };
}

describe("useSmoothStream resuming across a remount", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("picks up an in-progress reveal instead of retyping from the start", () => {
    const clock = stubAnimationFrame();
    const key = `resume-${Math.random()}`;

    const first = renderHook(({ target }) => useSmoothStream(target, true, {}, key), {
      initialProps: { target: "a".repeat(200) },
    });
    act(() => clock.advance(1000));
    const revealedBeforeUnmount = first.result.current.length;
    expect(revealedBeforeUnmount).toBeGreaterThan(0);
    expect(revealedBeforeUnmount).toBeLessThan(200);

    first.unmount();

    const second = renderHook(({ target }) => useSmoothStream(target, true, {}, key), {
      initialProps: { target: "a".repeat(400) },
    });
    expect(second.result.current.length).toBe(revealedBeforeUnmount);
  });

  it("starts fresh for a key with no recorded progress", () => {
    stubAnimationFrame();
    const { result } = renderHook(() => useSmoothStream("hello world", true, {}, `fresh-${Math.random()}`));

    expect(result.current).toBe("");
  });

  it("stops remembering progress once the stream is no longer enabled", () => {
    const clock = stubAnimationFrame();
    const key = `done-${Math.random()}`;

    const first = renderHook(({ enabled }) => useSmoothStream("a".repeat(200), enabled, {}, key), {
      initialProps: { enabled: true },
    });
    act(() => clock.advance(1000));
    expect(first.result.current.length).toBeGreaterThan(0);

    first.rerender({ enabled: false });
    first.unmount();

    const second = renderHook(() => useSmoothStream("a".repeat(200), true, {}, key));
    expect(second.result.current).toBe("");
  });

  it("without a persistKey, behaves exactly as before - starts at 0 and reveals over time", () => {
    const clock = stubAnimationFrame();
    const { result } = renderHook(({ target }) => useSmoothStream(target, true), {
      initialProps: { target: "a".repeat(200) },
    });
    expect(result.current).toBe("");

    act(() => clock.advance(1000));
    expect(result.current.length).toBeGreaterThan(0);
  });
});

describe("useSmoothStream after reattaching to a response", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the backlog at once and only types out what arrives after it", () => {
    const clock = stubAnimationFrame();
    const backlog = "b".repeat(5000);
    const { result, rerender } = renderHook(
      ({ target, instant }) => useSmoothStream(target, true, {}, `reattach-${Math.random()}`, instant),
      { initialProps: { target: "", instant: 0 } }
    );

    rerender({ target: backlog, instant: backlog.length });
    expect(result.current.length).toBe(backlog.length);

    rerender({ target: backlog + "n".repeat(300), instant: backlog.length });
    expect(result.current.length).toBe(backlog.length);
    act(() => clock.advance(100));
    expect(result.current.length).toBeGreaterThan(backlog.length);
    expect(result.current.length).toBeLessThan(backlog.length + 300);
  });

  it("never jumps past a tag that has only half arrived", () => {
    stubAnimationFrame();
    const text = "hello <fil";
    const { result } = renderHook(() =>
      useSmoothStream(text, true, { safeEnd: (t) => t.indexOf("<") }, `safe-${Math.random()}`, text.length)
    );

    expect(result.current).toBe("hello ");
  });
});
