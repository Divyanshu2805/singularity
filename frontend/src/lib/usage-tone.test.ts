/**
 * Tests for the chat usage meter's colour ramp.
 *
 * Handles: pinning the tone at each end and at the stops between, that a share outside 0 to 100 is held to the nearest
 * end, that the tone between two stops lies between them, and that the trail's gradient carries the same colours as
 * the planet does at those shares.
 */
import { describe, expect, it } from "vitest";
import { USAGE_TRAIL, usageTone } from "./usage-tone";

describe("usageTone", () => {
  it("runs from pale gold to a crimson ember", () => {
    expect(usageTone(0)).toBe("hsl(50 100% 82%)");
    expect(usageTone(45)).toBe("hsl(42 100% 64%)");
    expect(usageTone(75)).toBe("hsl(26 98% 56%)");
    expect(usageTone(100)).toBe("hsl(4 92% 56%)");
  });

  it("holds a share outside the allowance to the nearest end", () => {
    expect(usageTone(-20)).toBe(usageTone(0));
    expect(usageTone(140)).toBe(usageTone(100));
  });

  it("blends between two stops", () => {
    expect(usageTone(60)).toBe("hsl(34 99% 60%)");
    expect(usageTone(87.5)).toBe("hsl(15 95% 56%)");
  });
});

describe("USAGE_TRAIL", () => {
  it("lays the same tones round the circle", () => {
    expect(USAGE_TRAIL).toBe(
      `conic-gradient(from 0deg, ${usageTone(0)} 0%, ${usageTone(45)} 45%, ${usageTone(75)} 75%, ${usageTone(100)} 100%)`,
    );
  });
});
