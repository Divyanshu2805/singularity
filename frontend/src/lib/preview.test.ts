/**
 * Covers how the preview's state reads: the server's step names in order, a restart landing at the install step and
 * anything unknown at the start, and what a running preview needs after a build turn - nothing at all unless the
 * turn's files were really saved, and nothing from this tab when package.json changed, since the server installs.
 *
 * Also covers how often the server is asked, the words for a place in the line, whether a running preview is level
 * with the project's files, the three widths the frame cycles through, and that a failed start's cause is taken
 * from the kind the server sends before the words.
 *
 * Also covers auto-start, which is deliberately narrow: never for someone who has not started a preview here, never
 * after a failure, never over the user pressing Stop, and not until the tab is showing and the current state is
 * known.
 */
import { describe, expect, it } from "vitest";
import {
  AUTO_RETRY_DELAYS_MS,
  autoRetryDelay,
  previewFailureCause,
  PREVIEW_SANDBOX,
  autoStartKey,
  changedDependencies,
  describePreviewStartFailure,
  formatStopsIn,
  previewAddressFor,
  previewFollowUp,
  previewOrigin,
  previewStepIndex,
  shouldAutoStartPreview,
  shouldStartPreviewForBuild,
  PREVIEW_DEVICES,
  isWaitingForRunner,
  nextPreviewDevice,
  previewDeviceWidth,
  previewFailureTitle,
  previewPollInterval,
  holdsPreviewErrors,
  previewSync,
  queueMessage,
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

describe("what a running preview needs once a build turn has ended", () => {
  const running = { isRunning: true, hadError: false };
  const broken = { isRunning: true, hadError: true };

  it("is left to the server when a saved turn changed package.json, which installs and restarts by itself", () => {
    expect(previewFollowUp({ outcome: "SAVED", files: ["package.json", "src/App.tsx"] }, running)).toBe("none");
    expect(previewFollowUp({ outcome: "SAVED", files: ["package.json"] }, broken)).toBe("none");
  });

  it("is reloaded when it had reported an error and the turn saved files", () => {
    expect(previewFollowUp({ outcome: "SAVED", files: ["src/hooks/useTodos.ts"] }, broken)).toBe("reload");
    expect(previewFollowUp({ outcome: "INCOMPLETE", files: ["src/hooks/useTodos.ts"] }, broken)).toBe("reload");
    expect(previewFollowUp({ outcome: "OUT_OF_BUDGET", files: ["src/hooks/useTodos.ts"] }, broken)).toBe("reload");
  });

  it("is left alone when it had no error, so hot reload keeps whatever the person was doing inside", () => {
    expect(previewFollowUp({ outcome: "SAVED", files: ["src/App.tsx"] }, running)).toBe("none");
  });

  it.each(["FAILED", "STOPPED", "NOT_SAVED", "EMPTY", "ANSWERED"] as const)(
    "is left alone after a turn that ended %s, which saved nothing however much it appeared to write",
    (outcome) => {
      expect(previewFollowUp({ outcome, files: ["package.json", "src/App.tsx"] }, broken)).toBe("none");
    }
  );

  it("is left alone when the turn wrote no files or nothing is running", () => {
    expect(previewFollowUp({ outcome: "SAVED", files: [] }, broken)).toBe("none");
    expect(previewFollowUp({ outcome: "SAVED", files: ["package.json"] }, { isRunning: false, hadError: true })).toBe("none");
  });

  it("treats a turn whose ending it was not told as saved, as it always has", () => {
    expect(previewFollowUp({ outcome: undefined, files: ["src/App.tsx"] }, broken)).toBe("reload");
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

const apiError = (message: string, status: number, code?: string) => Object.assign(new Error(message), { status, code });

describe("describePreviewStartFailure", () => {
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
      expect(describePreviewStartFailure(apiError("Can't reach the Singularity server.", status)).kind).toBe("unreachable");
    }
  });

  it("treats a request that got no response at all as unreachable", () => {
    const failure = describePreviewStartFailure(new Error("Can't reach the Singularity server."));

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

describe("previewFailureCause", () => {
  it("blames the project only for what its own files decide", () => {
    expect(previewFailureCause("npm install failed - check package.json")).toBe("project");
    expect(previewFailureCause("The dev server stopped while starting")).toBe("project");
    expect(previewFailureCause("The preview took more than 4 minutes to start")).toBe("project");
  });

  it("blames the platform for everything else, including a failure with no words at all", () => {
    expect(previewFailureCause("Something went wrong starting the preview")).toBe("platform");
    expect(previewFailureCause("Couldn't copy the project's files into the preview")).toBe("platform");
    expect(previewFailureCause("The preview runner went away while starting")).toBe("platform");
    expect(previewFailureCause(null)).toBe("platform");
  });

  it("takes the server's word for the cause over the wording, however the sentence reads", () => {
    expect(previewFailureCause('The package "left-pad-2" doesn\'t exist on npm', "INSTALL")).toBe("project");
    expect(previewFailureCause("vite.config.ts has an error", "DEV_SERVER")).toBe("project");
    expect(previewFailureCause("The app's dev server didn't answer within 4 minutes.", "TIMEOUT")).toBe("project");
    expect(previewFailureCause("Every preview runner stayed busy for 5 minutes.", "CAPACITY")).toBe("project");
    expect(previewFailureCause("npm install failed - check package.json", "PLATFORM")).toBe("platform");
    expect(previewFailureCause("The package registry couldn't be reached while installing.", "PLATFORM")).toBe("platform");
  });
});

describe("a failed start with a kind", () => {
  it("is tried again only when the platform failed, and not after waiting a whole turn in the line", () => {
    expect(autoRetryDelay(0, { detail: "The package registry couldn't be reached", kind: "PLATFORM" })).toBe(AUTO_RETRY_DELAYS_MS[0]);
    expect(autoRetryDelay(0, { detail: "anything", kind: "INSTALL" })).toBeNull();
    expect(autoRetryDelay(0, { detail: "anything", kind: "CAPACITY" })).toBeNull();
  });

  it("is titled by what failed", () => {
    expect(previewFailureTitle("INSTALL")).toBe("The project's packages couldn't be installed");
    expect(previewFailureTitle("DEV_SERVER")).toBe("The app's dev server couldn't start");
    expect(previewFailureTitle("CAPACITY")).toBe("Every preview runner is busy");
    expect(previewFailureTitle(null)).toBe("The preview couldn't start");
    expect(previewFailureTitle(undefined)).toBe("The preview couldn't start");
  });
});

describe("previewPollInterval", () => {
  it("asks quickly while starting or taking a change in, slowly once level, and not at all otherwise", () => {
    expect(previewPollInterval(preview({ status: "CREATING" }), true)).toBe(2_000);
    expect(previewPollInterval(preview({ status: "RUNNING", syncState: "UPDATING" }), true)).toBe(1_500);
    expect(previewPollInterval(preview({ status: "RUNNING", syncState: "UP_TO_DATE" }), true)).toBe(20_000);
    expect(previewPollInterval(preview({ status: "RUNNING" }), true)).toBe(20_000);
    expect(previewPollInterval(preview({ status: "FAILED" }), true)).toBe(false);
    expect(previewPollInterval(preview({ status: "TERMINATED" }), true)).toBe(false);
    expect(previewPollInterval(null, true)).toBe(false);
  });

  it("does not ask while the tab is not showing the preview", () => {
    expect(previewPollInterval(preview({ status: "RUNNING", syncState: "UPDATING" }), false)).toBe(false);
    expect(previewPollInterval(preview({ status: "CREATING" }), false)).toBe(false);
  });
});

describe("the line for a runner", () => {
  it("knows a start that is waiting from one that is starting", () => {
    expect(isWaitingForRunner(preview({ status: "CREATING", queuePosition: 2, detail: "Waiting for a free runner" }))).toBe(true);
    expect(isWaitingForRunner(preview({ status: "CREATING", detail: "Waiting for a free runner" }))).toBe(true);
    expect(isWaitingForRunner(preview({ status: "CREATING", detail: "Installing dependencies" }))).toBe(false);
    expect(isWaitingForRunner(preview({ status: "RUNNING", queuePosition: 1 }))).toBe(false);
    expect(isWaitingForRunner(null)).toBe(false);
  });

  it("says where the person stands", () => {
    expect(queueMessage(1)).toBe("You're next in line.");
    expect(queueMessage(null)).toBe("You're next in line.");
    expect(queueMessage(2)).toBe("You're 2nd in line.");
    expect(queueMessage(3)).toBe("You're 3rd in line.");
    expect(queueMessage(4)).toBe("You're 4th in line.");
    expect(queueMessage(11)).toBe("You're 11th in line.");
    expect(queueMessage(12)).toBe("You're 12th in line.");
    expect(queueMessage(21)).toBe("You're 21st in line.");
  });
});

describe("previewSync", () => {
  it("says a running preview is up to date or updating, with the step when it is updating", () => {
    expect(previewSync(preview({ status: "RUNNING", syncState: "UP_TO_DATE" }))).toMatchObject({ isUpdating: false, label: "Up to date" });
    expect(previewSync(preview({ status: "RUNNING", syncState: "UPDATING", syncDetail: "Installing new packages" })))
      .toEqual({ isUpdating: true, label: "Updating", detail: "Installing new packages" });
    expect(previewSync(preview({ status: "RUNNING", syncState: "UPDATING" }))?.detail).toBe("Applying your changes");
  });

  it("says nothing for a preview that is not running, or from a server that does not report it", () => {
    expect(previewSync(preview({ status: "CREATING", syncState: "UPDATING" }))).toBeNull();
    expect(previewSync(preview({ status: "RUNNING" }))).toBeNull();
    expect(previewSync(null)).toBeNull();
  });
});

describe("the widths the frame can be held to", () => {
  it("cycles full width, tablet, phone and back", () => {
    expect(nextPreviewDevice("desktop")).toBe("tablet");
    expect(nextPreviewDevice("tablet")).toBe("mobile");
    expect(nextPreviewDevice("mobile")).toBe("desktop");
  });

  it("holds a tablet wider than a phone and leaves full width unconstrained", () => {
    expect(previewDeviceWidth("desktop")).toBeNull();
    expect(previewDeviceWidth("tablet")).toBeGreaterThan(previewDeviceWidth("mobile") ?? 0);
    expect(PREVIEW_DEVICES.map((entry) => entry.label)).toEqual(["Full width", "Tablet width", "Phone width"]);
  });
});

describe("previewStepIndex for the server's own restart", () => {
  it("puts installing a new package at the install step", () => {
    expect(previewStepIndex("Installing new packages")).toBe(2);
  });
});

describe("autoRetryDelay", () => {
  it("tries a platform failure again by itself, further apart each time, and then stops", () => {
    const failure = { detail: "Something went wrong starting the preview" };

    expect(AUTO_RETRY_DELAYS_MS.map((_, attempt) => autoRetryDelay(attempt, failure))).toEqual([...AUTO_RETRY_DELAYS_MS]);
    expect(autoRetryDelay(AUTO_RETRY_DELAYS_MS.length, failure)).toBeNull();
  });

  it("never repeats a start the project's own code failed", () => {
    expect(autoRetryDelay(0, { detail: "npm install failed - check package.json" })).toBeNull();
  });

  it("retries a start request that reached nobody, a failed dependency and busy runners", () => {
    expect(autoRetryDelay(0, { startError: new Error("Can't reach the Singularity server.") })).toBe(AUTO_RETRY_DELAYS_MS[0]);
    expect(autoRetryDelay(0, { startError: apiError("Unavailable", 503, "UPSTREAM_UNAVAILABLE") })).toBe(AUTO_RETRY_DELAYS_MS[0]);
    expect(autoRetryDelay(1, { startError: apiError("Busy", 503, "CAPACITY_UNAVAILABLE") })).toBe(AUTO_RETRY_DELAYS_MS[1]);
  });

  it("does not retry a refusal: the plan's allowance, no access, no such project", () => {
    for (const status of [402, 403, 404]) {
      expect(autoRetryDelay(0, { startError: apiError("No", status) })).toBeNull();
    }
  });
});

describe("the preview iframe sandbox", () => {
  const tokens = PREVIEW_SANDBOX.split(" ");

  it("keeps the preview on its own origin and able to run, which the message check and proxy cookie need", () => {
    expect(tokens).toContain("allow-scripts");
    expect(tokens).toContain("allow-same-origin");
  });

  it("never lets the previewed page navigate the app or reach the top window", () => {
    expect(tokens).not.toContain("allow-top-navigation");
    expect(tokens).not.toContain("allow-top-navigation-by-user-activation");
    expect(tokens).not.toContain("allow-popups-to-escape-sandbox");
  });
});

describe("shouldStartPreviewForBuild", () => {
  const ready = { canEdit: true, isLoaded: true, isStarting: false };

  it("starts one for an editor's build when the project has none, or its last one ended or failed", () => {
    expect(shouldStartPreviewForBuild({ ...ready, preview: null })).toBe(true);
    expect(shouldStartPreviewForBuild({ ...ready, preview: preview({ status: "TERMINATED", detail: "Idle for 10 minutes" }) })).toBe(true);
    expect(shouldStartPreviewForBuild({ ...ready, preview: preview({ status: "FAILED", detail: "npm install failed" }) })).toBe(true);
  });

  it("leaves a preview that is running or already starting alone", () => {
    expect(shouldStartPreviewForBuild({ ...ready, preview: preview({ status: "RUNNING" }) })).toBe(false);
    expect(shouldStartPreviewForBuild({ ...ready, preview: preview({ status: "CREATING" }) })).toBe(false);
    expect(shouldStartPreviewForBuild({ ...ready, isStarting: true, preview: null })).toBe(false);
  });

  it("never starts one over a Stop the person pressed, for a viewer, or before the state is known", () => {
    expect(shouldStartPreviewForBuild({ ...ready, preview: preview({ status: "TERMINATED", detail: "Stopped" }) })).toBe(false);
    expect(shouldStartPreviewForBuild({ ...ready, canEdit: false, preview: null })).toBe(false);
    expect(shouldStartPreviewForBuild({ ...ready, isLoaded: false, preview: undefined })).toBe(false);
  });
});

describe("holding back an error from a page that is between two states", () => {
  const level = preview({ status: "RUNNING", syncState: "UP_TO_DATE" });

  it("holds it while a response is being written, while finding out what it changed, and while it is applied", () => {
    expect(holdsPreviewErrors({ isBuilding: true, isSettling: false, preview: level })).toBe(true);
    expect(holdsPreviewErrors({ isBuilding: false, isSettling: true, preview: level })).toBe(true);
    expect(holdsPreviewErrors({ isBuilding: false, isSettling: false, preview: preview({ status: "RUNNING", syncState: "UPDATING" }) })).toBe(true);
  });

  it("shows it at once when nothing is changing", () => {
    expect(holdsPreviewErrors({ isBuilding: false, isSettling: false, preview: level })).toBe(false);
    expect(holdsPreviewErrors({ isBuilding: false, isSettling: false, preview: preview({ status: "RUNNING" }) })).toBe(false);
    expect(holdsPreviewErrors({ isBuilding: false, isSettling: false, preview: null })).toBe(false);
  });
});
