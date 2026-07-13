import { describe, expect, it } from "vitest";
import {
  autoStartKey,
  changedDependencies,
  formatStopsIn,
  previewOrigin,
  previewStepIndex,
  shouldAutoStartPreview,
} from "./preview";
import type { Preview } from "./types";

const preview = (overrides: Partial<Preview>): Preview => ({
  id: 7,
  projectId: 1,
  status: "RUNNING",
  previewUrl: "http://p1-abc.localhost:8090/",
  detail: null,
  startedAt: null,
  readyAt: null,
  terminatedAt: null,
  stopsAt: null,
  canStop: true,
  ...overrides,
});

describe("previewStepIndex", () => {
  it("follows the server's step names in order", () => {
    expect(previewStepIndex("Starting a runner")).toBe(0);
    expect(previewStepIndex("Copying project files")).toBe(1);
    expect(previewStepIndex("Installing dependencies")).toBe(2);
    expect(previewStepIndex("Starting the dev server")).toBe(3);
  });

  it("puts a restart at the install step, and anything unknown at the start", () => {
    expect(previewStepIndex("Restarting the dev server")).toBe(2);
    expect(previewStepIndex("Something new")).toBe(0);
    expect(previewStepIndex(null)).toBe(0);
  });
});

describe("shouldAutoStartPreview", () => {
  const base = { isVisible: true, isLoaded: true, stoppedByUser: false, lastAutoStartKey: null };

  it("never starts one for someone who hasn't started a preview here - a collaborator's doesn't count", () => {
    expect(shouldAutoStartPreview({ ...base, preview: null })).toBe(false);
  });

  it("brings back one that was stopped for inactivity", () => {
    const ended = preview({ status: "TERMINATED", detail: "Stopped after 30 minutes without a visit" });
    expect(shouldAutoStartPreview({ ...base, preview: ended })).toBe(true);
    expect(shouldAutoStartPreview({ ...base, preview: ended, lastAutoStartKey: autoStartKey(ended) })).toBe(false);
  });

  it("never retries a failure, or overrides the user pressing Stop", () => {
    expect(shouldAutoStartPreview({ ...base, preview: preview({ status: "FAILED" }) })).toBe(false);
    expect(shouldAutoStartPreview({ ...base, preview: null, stoppedByUser: true })).toBe(false);
    // ...including a Stop from before this page loaded, e.g. then a refresh.
    expect(shouldAutoStartPreview({ ...base, preview: preview({ status: "TERMINATED", detail: "Stopped" }) })).toBe(false);
  });

  it("waits until the tab is showing and the current state is known", () => {
    expect(shouldAutoStartPreview({ ...base, preview: null, isVisible: false })).toBe(false);
    expect(shouldAutoStartPreview({ ...base, preview: undefined, isLoaded: false })).toBe(false);
    expect(shouldAutoStartPreview({ ...base, preview: preview({ status: "CREATING" }) })).toBe(false);
  });
});

describe("changedDependencies", () => {
  it("matches only the root manifest, with or without a leading slash", () => {
    expect(changedDependencies(["src/App.tsx", "package.json"])).toBe(true);
    expect(changedDependencies(["/package.json"])).toBe(true);
    expect(changedDependencies(["packages/ui/package.json", "src/package.json.ts"])).toBe(false);
  });
});

describe("previewOrigin", () => {
  it("keeps the port, since messages are checked against the exact origin", () => {
    expect(previewOrigin("http://p1-abc.localhost:8090/")).toBe("http://p1-abc.localhost:8090");
    expect(previewOrigin("not a url")).toBeNull();
    expect(previewOrigin(null)).toBeNull();
  });
});

describe("formatStopsIn", () => {
  it("reads as minutes, then hours", () => {
    const now = Date.parse("2026-09-16T10:00:00Z");
    expect(formatStopsIn("2026-09-16T10:29:40Z", now)).toBe("30m");
    expect(formatStopsIn("2026-09-16T11:05:00Z", now)).toBe("1h 5m");
    expect(formatStopsIn("2026-09-16T09:00:00Z", now)).toBe("0m");
    expect(formatStopsIn(null, now)).toBeNull();
  });
});
