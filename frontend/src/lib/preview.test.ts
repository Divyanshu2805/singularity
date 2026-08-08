/**
 * Covers how the preview's state reads: the server's step names in order, a restart landing at the install step and
 * anything unknown at the start, and which dependency changes call for a restart rather than a reload.
 *
 * Also covers auto-start, which is deliberately narrow: never for someone who has not started a preview here, never
 * after a failure, never over the user pressing Stop, and not until the tab is showing and the current state is
 * known.
 */
import { describe, expect, it } from "vitest";
import {
  autoStartKey,
  changedDependencies,
  describePreviewStartFailure,
  formatStopsIn,
  previewAddressFor,
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

describe("previewAddressFor", () => {
  const previewUrl = "http://p1-abc.localhost:8090/?pvt=1700000000.deadbeef";

  it("carries the access token forward when resolving an in-app path, which new URL(path, base) alone drops", () => {
    const { shareableLink } = previewAddressFor("/dashboard", previewUrl);

    expect(shareableLink).toBe("http://p1-abc.localhost:8090/dashboard?pvt=1700000000.deadbeef");
  });

  it("keeps the visible address free of the token", () => {
    const { address } = previewAddressFor("/dashboard", previewUrl);

    expect(address).toBe("p1-abc.localhost:8090/dashboard");
    expect(address).not.toContain("pvt");
  });

  it("preserves a hash in the in-app path", () => {
    const { address, shareableLink } = previewAddressFor("/settings#billing", previewUrl);

    expect(address).toBe("p1-abc.localhost:8090/settings#billing");
    expect(shareableLink).toBe("http://p1-abc.localhost:8090/settings?pvt=1700000000.deadbeef#billing");
  });

  it("handles the root path the same way", () => {
    const { address, shareableLink } = previewAddressFor("/", previewUrl);

    expect(address).toBe("p1-abc.localhost:8090/");
    expect(shareableLink).toBe(previewUrl);
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

describe("describePreviewStartFailure", () => {
  const apiError = (message: string, status: number, code?: string) => Object.assign(new Error(message), { status, code });

  it("says the runners are busy only for the capacity code, and keeps the server's own words", () => {
    const failure = describePreviewStartFailure(
      apiError("Every preview runner is busy right now. Try again in a minute.", 503, "CAPACITY_UNAVAILABLE")
    );

    expect(failure.kind).toBe("busy");
    expect(failure.title).toBe("Every preview runner is busy");
    expect(failure.message).toBe("Every preview runner is busy right now. Try again in a minute.");
  });

  it("does not call a failed dependency 'busy' - the same 503 with a different code, which is the bug this replaced", () => {
    const failure = describePreviewStartFailure(
      apiError("This is temporarily unavailable. Please try again.", 503, "UPSTREAM_UNAVAILABLE")
    );

    expect(failure.kind).toBe("failed");
    expect(failure.title).toBe("The preview couldn't start");
    expect(failure.title).not.toMatch(/busy/i);
    expect(failure.message).toBe("This is temporarily unavailable. Please try again.");
    expect(failure.hint).toMatch(/your files are untouched/i);
  });

  it("goes by the code, not the wording", () => {
    expect(describePreviewStartFailure(apiError("Every preview runner is busy", 503, "UPSTREAM_UNAVAILABLE")).kind).toBe("failed");
    expect(describePreviewStartFailure(apiError("Try later", 503, "CAPACITY_UNAVAILABLE")).kind).toBe("busy");
  });

  it("treats a 502/503/504 with no code as unreachable: the Gateway or dev proxy had nobody to ask", () => {
    for (const status of [502, 503, 504]) {
      expect(describePreviewStartFailure(apiError("Can't reach the VibeCraft server.", status)).kind).toBe("unreachable");
    }
  });

  it("treats a request that got no response at all as unreachable", () => {
    const failure = describePreviewStartFailure(new Error("Can't reach the VibeCraft server."));

    expect(failure.kind).toBe("unreachable");
    expect(failure.title).toBe("The preview service isn't reachable");
  });

  it("treats a service's own failures (500, 403) as the preview failing, not as unreachable or busy", () => {
    expect(describePreviewStartFailure(apiError("An unexpected error occurred", 500)).kind).toBe("failed");
    expect(describePreviewStartFailure(apiError("Access Denied", 403)).kind).toBe("failed");
  });

  it("survives being handed something that isn't an error", () => {
    expect(describePreviewStartFailure(undefined)).toMatchObject({ kind: "unreachable", message: "Something went wrong." });
    expect(describePreviewStartFailure("boom")).toMatchObject({ kind: "unreachable" });
  });
});
