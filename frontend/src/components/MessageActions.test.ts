import { describe, it, expect, vi, afterEach } from "vitest";
import { formatMessageTime } from "./MessageActions";

/** Freezes "now" so "Today"/"Yesterday" can be asserted without depending on the day the suite runs. */
function at(now: string, run: () => void) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
  try {
    run();
  } finally {
    vi.useRealTimers();
  }
}

describe("formatMessageTime", () => {
  afterEach(() => vi.useRealTimers());

  it("says 'Today at …' for something sent today", () => {
    at("2026-09-15T21:00:00", () => {
      expect(formatMessageTime(new Date("2026-09-15T20:29:00").toISOString())).toMatch(/^Today at /);
    });
  });

  it("says 'Yesterday at …' for the day before", () => {
    at("2026-09-15T09:00:00", () => {
      expect(formatMessageTime(new Date("2026-09-14T22:10:00").toISOString())).toMatch(/^Yesterday at /);
    });
  });

  it("gives a date once it's older than yesterday, and includes the year only when it differs", () => {
    at("2026-09-15T09:00:00", () => {
      const thisYear = formatMessageTime(new Date("2026-03-02T15:00:00").toISOString());
      expect(thisYear).toMatch(/ at /);
      expect(thisYear).not.toContain("2026");

      expect(formatMessageTime(new Date("2025-12-31T15:00:00").toISOString())).toContain("2025");
    });
  });

  it("returns null rather than 'Invalid Date' for missing or unparseable input", () => {
    expect(formatMessageTime(undefined)).toBeNull();
    expect(formatMessageTime("")).toBeNull();
    expect(formatMessageTime("not a date")).toBeNull();
  });
});
