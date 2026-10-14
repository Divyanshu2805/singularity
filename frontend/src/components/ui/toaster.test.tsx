/**
 * Covers how long a toast stays: three seconds, or its own duration, whatever happens to the window's focus.
 *
 * Handles: a toast gone after three seconds; one raised while the window had already lost focus to the preview frame
 * - which Radix on its own holds until the window has focus again - gone after three seconds too; and a toast that
 * asks to stay longer staying its time.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "./toaster";
import { toast } from "@/hooks/use-toast";

describe("Toaster", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const show = (title: string, duration?: number) => act(() => {
    toast({ title, duration });
  });
  const wait = (ms: number) => act(() => {
    vi.advanceTimersByTime(ms);
  });

  it("lets a toast go after three seconds", () => {
    render(<Toaster />);
    show("Saved in Index.tsx");
    expect(screen.getByText("Saved in Index.tsx")).toBeInTheDocument();
    wait(3_500);
    expect(screen.queryByText("Saved in Index.tsx")).not.toBeInTheDocument();
  });

  it("lets it go even when it is raised after the window lost focus to the preview frame", () => {
    render(<Toaster />);
    show("First");
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    show("Saved in Index.tsx");
    wait(3_500);
    expect(screen.queryByText("Saved in Index.tsx")).not.toBeInTheDocument();
  });

  it("keeps a toast that asks to stay longer for its time", () => {
    render(<Toaster />);
    show("Project invitation", 10_000);
    wait(3_500);
    expect(screen.getByText("Project invitation")).toBeInTheDocument();
    wait(7_000);
    expect(screen.queryByText("Project invitation")).not.toBeInTheDocument();
  });
});
