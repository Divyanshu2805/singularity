/**
 * Covers cutting the model's working-out into steps: one per line or, for a single paragraph, per sentence; list
 * markers dropped; and the step still being written held back until it is whole.
 */
import { describe, it, expect } from "vitest";
import { thoughtSteps } from "./thought";

describe("thoughtSteps", () => {
  it("takes one step per line, without list markers or blank lines", () => {
    expect(thoughtSteps("- One page, so no router.\n\n2. State lives in the hook.\n* Plain CSS.", true)).toEqual([
      "One page, so no router.",
      "State lives in the hook.",
      "Plain CSS.",
    ]);
  });

  it("splits a single paragraph into its sentences", () => {
    expect(thoughtSteps("One page, so no router. State lives in the hook! Is storage needed? No.", true)).toEqual([
      "One page, so no router.",
      "State lives in the hook!",
      "Is storage needed?",
      "No.",
    ]);
  });

  it("does not split inside a sentence on a dot that is not followed by a space", () => {
    expect(thoughtSteps("Use src/App.tsx and v1.2 as is.", true)).toEqual(["Use src/App.tsx and v1.2 as is."]);
  });

  it("holds back the last step while the block is still arriving, and shows it once the block is whole", () => {
    expect(thoughtSteps("One page.\nState lives in the ho", false)).toEqual(["One page."]);
    expect(thoughtSteps("One page.\nState lives in the hook.", true)).toEqual(["One page.", "State lives in the hook."]);
    expect(thoughtSteps("One page. State lives in the ho", false)).toEqual(["One page."]);
  });

  it("is empty for nothing at all", () => {
    expect(thoughtSteps("", true)).toEqual([]);
    expect(thoughtSteps("  \n ", false)).toEqual([]);
  });
});
