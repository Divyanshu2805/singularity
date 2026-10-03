/**
 * Tests for the store that marks a just-deleted project as leaving.
 *
 * Handles: marking and clearing, and the reset on sign-out that every module-level store must have.
 */
import { afterEach, describe, expect, it } from "vitest";
import { clearProjectLeaving, getLeavingProjectId, markProjectLeaving } from "./project-leaving";
import { clearSignedInState } from "./session";

afterEach(() => clearProjectLeaving());

describe("project-leaving", () => {
  it("holds the project that is fading out until it is cleared", () => {
    expect(getLeavingProjectId()).toBeNull();
    markProjectLeaving(7);
    expect(getLeavingProjectId()).toBe(7);
    clearProjectLeaving();
    expect(getLeavingProjectId()).toBeNull();
  });

  it("is reset when the session ends", () => {
    markProjectLeaving(3);
    clearSignedInState();
    expect(getLeavingProjectId()).toBeNull();
  });
});
