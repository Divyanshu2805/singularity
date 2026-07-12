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
    // A page opened later in the same session (the new project's first build) reads the same choice.
    expect(renderHook(() => useTeachingMode()).result.current[0]).toBe(true);
  });

  it("is never remembered across sessions - walkthroughs roughly double every build's output", () => {
    const { result } = renderHook(() => useTeachingMode());
    act(() => result.current[1](true));

    // Nothing about the choice is written to storage, so a reload starts with it off rather than silently
    // making every future build slower and more expensive.
    expect(Object.keys(localStorage)).not.toContain("teaching_mode");
    expect(localStorage.getItem("teaching_mode")).toBeNull();
  });
});
