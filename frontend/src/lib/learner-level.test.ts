/**
 * Covers the reader's level: new to code unless chosen otherwise, kept in this browser under the signed-in person's
 * own id so a second account does not inherit it, a stored value that is not a level ignored, and the copy in memory
 * dropped on sign-out.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: 7 };
vi.mock("./api", () => ({ getUserInfo: () => ({ id: user.id, username: "u", name: "U" }) }));

import { getLearnerLevel, LEARNER_LEVELS, setLearnerLevel, useLearnerLevel } from "./learner-level";
import { clearSignedInState } from "./session";

describe("the reader's level", () => {
  beforeEach(() => {
    localStorage.clear();
    user.id = 7;
    clearSignedInState();
  });

  it("is new to code until the person says otherwise", () => {
    expect(getLearnerLevel()).toBe("NEW");
    expect(LEARNER_LEVELS.map((level) => level.value)).toEqual(["NEW", "SOME", "DEVELOPER"]);
  });

  it("is kept under the person's own id, and survives sign-out for them only", () => {
    setLearnerLevel("DEVELOPER");
    expect(getLearnerLevel()).toBe("DEVELOPER");
    expect(localStorage.getItem("learner_level_7")).toBe("DEVELOPER");

    clearSignedInState();
    user.id = 8;
    expect(getLearnerLevel()).toBe("NEW");

    clearSignedInState();
    user.id = 7;
    expect(getLearnerLevel()).toBe("DEVELOPER");
  });

  it("ignores a stored value that is not a level", () => {
    localStorage.setItem("learner_level_7", "WIZARD");

    expect(getLearnerLevel()).toBe("NEW");
  });
});

describe("useLearnerLevel", () => {
  beforeEach(() => {
    localStorage.clear();
    user.id = 7;
    clearSignedInState();
  });

  it("follows a change, and goes back to new to code on sign-out", () => {
    const { result, unmount } = renderHook(() => useLearnerLevel());
    expect(result.current[0]).toBe("NEW");

    act(() => result.current[1]("SOME"));
    expect(result.current[0]).toBe("SOME");

    user.id = 8;
    act(() => clearSignedInState());
    expect(result.current[0]).toBe("NEW");

    unmount();
    expect(() => setLearnerLevel("NEW")).not.toThrow();
  });
});
