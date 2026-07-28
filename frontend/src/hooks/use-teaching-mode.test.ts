/**
 * Covers the teaching-mode toggle: off until someone turns it on, one setting everywhere so the dashboard's switch
 * and the chat's stay in step, and never remembered across sessions.
 *
 * That last one matters because walkthroughs roughly double every build's output, so a setting left on days later is
 * a slow, expensive surprise.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { setTeachingMode, useTeachingMode } from "./use-teaching-mode";

describe("useTeachingMode", () => {
  beforeEach(() => {
    localStorage.clear();
    setTeachingMode(false);
  });

  it("is off until someone turns it on", () => {
    const { result } = renderHook(() => useTeachingMode());
    expect(result.current[0]).toBe(false);
  });

  it("is one setting everywhere: the dashboard's toggle and the chat's stay in step", () => {
    const dashboard = renderHook(() => useTeachingMode());
    const chat = renderHook(() => useTeachingMode());

    act(() => dashboard.result.current[1](true));

    expect(chat.result.current[0]).toBe(true);
    expect(renderHook(() => useTeachingMode()).result.current[0]).toBe(true);
  });

  it("is never remembered across sessions - walkthroughs roughly double every build's output", () => {
    const { result } = renderHook(() => useTeachingMode());
    act(() => result.current[1](true));

    expect(Object.keys(localStorage)).not.toContain("teaching_mode");
    expect(localStorage.getItem("teaching_mode")).toBeNull();
  });
});
