/**
 * Tests for how the landing page's steps map onto the app's screens, and for the ticker the window reads them from.
 *
 * Handles: checking that a step's progress picks the right screen and moment (the last step handing over from the
 * change to the reloaded preview), that the steps' clock walks through every step and wraps, and that the ticker
 * rounds its moments and only tells its listeners when the moment really changes.
 */
import { describe, expect, it, vi } from "vitest";
import { LAST_SCENE, STORY, STORY_MS, createTicker, sceneFor, stepOnClock } from "./story";

describe("sceneFor", () => {
  it("plays a one-screen step from its start to its end", () => {
    expect(sceneFor(0, 0)).toEqual({ scene: 0, t: 0 });
    expect(sceneFor(0, 1)).toEqual({ scene: 0, t: STORY[0].scenes[0].ms });
  });

  it("hands the last step over from the change to the reloaded preview", () => {
    expect(sceneFor(4, 0.1).scene).toBe(4);
    expect(sceneFor(4, 0.9).scene).toBe(5);
    expect(sceneFor(4, 1)).toEqual({ scene: 5, t: STORY[4].scenes[1].ms });
  });

  it("knows the last screen any step plays", () => {
    expect(LAST_SCENE).toBe(5);
  });
});

describe("stepOnClock", () => {
  it("walks through every step and wraps round", () => {
    expect(stepOnClock(0)).toEqual({ index: 0, fraction: 0 });
    const seen = new Set<number>();
    for (let t = 0; t < STORY_MS; t += 500) seen.add(stepOnClock(t).index);
    expect(seen.size).toBe(STORY.length);
    expect(stepOnClock(STORY_MS + 10).index).toBe(0);
  });
});

describe("createTicker", () => {
  it("rounds moments and only notifies on a real change", () => {
    const ticker = createTicker();
    const listener = vi.fn();
    ticker.subscribe(listener);
    ticker.set(1, 1, 1003);
    expect(ticker.get()).toEqual({ step: 1, scene: 1, t: 1000 });
    ticker.set(1, 1, 1012);
    expect(listener).toHaveBeenCalledTimes(1);
    ticker.set(1, 1, 1030);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
