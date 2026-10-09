/**
 * The preview's states as the UI talks about them.
 *
 * Handles: the ordered start-up steps and which one is in progress, whether opening the tab should bring a preview
 * back by itself, the key that remembers an auto-start, detecting a dependency change that needs a restart rather
 * than a reload, deciding what a running preview needs once a build turn has ended, the preview's own origin for
 * message checks, turning a failure into words with a cause, telling a failure of the project's own code from one of
 * the platform under it, deciding whether and when a failed start is tried again without being asked, whether a
 * build request should start the preview, formatting the idle countdown, how often to ask the server about a
 * preview, the words for a place in the line for a runner, whether a running preview is level with the project's
 * files, whether an error from the page should be held back until it is, and the widths the frame can be held to.
 *
 * The step names must match what the server writes, since the checklist ticks by matching them. Auto-start is
 * deliberately narrow: only this person's own preview that ended without them choosing it, never one a collaborator
 * started.
 *
 * A preview is only reloaded after a turn whose files were really saved. A turn that failed, was stopped or could not
 * be saved changed nothing in the project, whatever the answer on screen appeared to write.
 *
 * Installing a new package is the server's job now, not this tab's. It used to be asked for from here when a turn's
 * files included package.json, which meant only the tab that ran the turn asked - a collaborator's tab, or a
 * restore, got a preview that failed on an import it could not resolve. The server compares package.json with the
 * one it installed and restarts by itself, so the only follow-up left to the tab is reloading a frame that had
 * shown an error.
 *
 * The cause of a failed start comes from the server as a kind. It was worked out here from the opening words of the
 * failure's sentence, so rewording a sentence changed whether a start was retried; the words are still read for a
 * preview that failed before the kind existed.
 *
 * A start that failed because of the platform - the cluster, the router, storage, a service restarting - is tried
 * again by itself a few times, further apart each time, and the person sees a preview that is still starting rather
 * than an error with a button. It used to stop at the first failure and offer "Ask AI to fix" for a Redis connection,
 * which no change to the project could mend. Only a failure the project's own files caused - the install, the dev
 * server, a start that never answered - is left for the person, because repeating it repeats the same result.
 * Going over the plan's allowance and being refused are not retried either, and nor is a start that waited its
 * whole turn in the line and found no runner: it has already waited.
 */
import type { Preview, PreviewFailureKind, TurnOutcome } from "./types";

export const PREVIEW_STEPS = [
  { detail: "Starting a runner", label: "Starting a runner" },
  { detail: "Copying project files", label: "Copying your files" },
  { detail: "Installing dependencies", label: "Installing dependencies" },
  { detail: "Starting the dev server", label: "Starting the dev server" },
] as const;

export const WAITING_FOR_RUNNER = "Waiting for a free runner";

export function previewStepIndex(detail: string | null | undefined): number {
  if (!detail) return 0;
  if (detail === "Restarting the dev server" || detail === "Installing new packages") return 2;
  const index = PREVIEW_STEPS.findIndex((step) => step.detail === detail);
  return index === -1 ? 0 : index;
}

export function shouldAutoStartPreview(args: {
  isVisible: boolean;
  isLoaded: boolean;
  preview: Preview | null | undefined;
  stoppedByUser: boolean;
  lastAutoStartKey: string | null;
}): boolean {
  const { isVisible, isLoaded, preview, stoppedByUser, lastAutoStartKey } = args;
  if (!isVisible || !isLoaded || stoppedByUser) return false;
  if (!preview || preview.status !== "TERMINATED") return false;
  if (preview.detail === STOPPED_BY_USER) return false;
  return lastAutoStartKey !== autoStartKey(preview);
}

/**
 * Whether sending a build request should start the project's preview. The files a build writes are type-checked in
 * the running preview before they are saved, so a build with no preview goes unchecked - and the person then waits
 * a second time for the preview to start. It is started only for someone who may edit, only when none is running
 * or starting, and never over a Stop the person pressed themselves.
 */
export function shouldStartPreviewForBuild(args: {
  canEdit: boolean;
  isLoaded: boolean;
  isStarting: boolean;
  preview: Preview | null | undefined;
}): boolean {
  const { canEdit, isLoaded, isStarting, preview } = args;
  if (!canEdit || !isLoaded || isStarting) return false;
  if (!preview) return true;
  if (preview.status === "RUNNING" || preview.status === "CREATING") return false;
  return preview.detail !== STOPPED_BY_USER;
}

export const STOPPED_BY_USER = "Stopped";

export const autoStartKey = (preview: Preview | null | undefined) => (preview ? `ended-${preview.id}` : "none");

export const changedDependencies = (paths: readonly string[]) =>
  paths.some((path) => path.replace(/^\/+/, "") === "package.json");

export type PreviewFollowUp = "reload" | "none";

export function previewFollowUp(
  turn: { outcome: TurnOutcome | undefined; files: readonly string[] },
  preview: { isRunning: boolean; hadError: boolean }
): PreviewFollowUp {
  if (!preview.isRunning || turn.files.length === 0) return "none";
  if (turn.outcome !== undefined && turn.outcome !== "SAVED" && turn.outcome !== "INCOMPLETE" && turn.outcome !== "OUT_OF_BUDGET") return "none";
  if (changedDependencies(turn.files)) return "none";
  return preview.hadError ? "reload" : "none";
}

const STARTING_POLL_MS = 2_000;
const UPDATING_POLL_MS = 1_500;
const RUNNING_POLL_MS = 20_000;

/**
 * How long to wait before asking the server about the preview again, or false to stop asking. Fast while it starts,
 * so the checklist ticks along, and while it takes a change in, so "Updating" gives way to "Up to date" promptly;
 * slow once it is running and level, where each poll is the heartbeat that keeps it from being stopped as idle and
 * the moment a pod that has gone is noticed.
 */
export function previewPollInterval(preview: Preview | null | undefined, isActive: boolean): number | false {
  if (!isActive || !preview) return false;
  if (preview.status === "CREATING") return STARTING_POLL_MS;
  if (preview.status !== "RUNNING") return false;
  return preview.syncState === "UPDATING" ? UPDATING_POLL_MS : RUNNING_POLL_MS;
}

export const isWaitingForRunner = (preview: Preview | null | undefined) =>
  preview?.status === "CREATING" && (preview.queuePosition != null || preview.detail === WAITING_FOR_RUNNER);

export function queueMessage(position: number | null | undefined): string {
  if (!position || position <= 1) return "You're next in line.";
  const tens = position % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ["th", "st", "nd", "rd"][position % 10] ?? "th";
  return `You're ${position}${suffix} in line.`;
}

export interface PreviewSync {
  isUpdating: boolean;
  label: "Up to date" | "Updating";
  detail: string | null;
}

export function previewSync(preview: Preview | null | undefined): PreviewSync | null {
  if (preview?.status !== "RUNNING" || !preview.syncState) return null;
  const isUpdating = preview.syncState === "UPDATING";
  return {
    isUpdating,
    label: isUpdating ? "Updating" : "Up to date",
    detail: isUpdating ? preview.syncDetail ?? "Applying your changes" : "Showing your latest saved changes",
  };
}

/**
 * Whether an error the page reports should be kept back for now rather than shown. While a response is being
 * written, while the tab is finding out what that response changed, and while the server is still applying it, the
 * page is between two states of the project: its files have arrived and the package they import has not been
 * installed yet, or half of a change has hot-reloaded and the other half has not. An error from that moment is
 * usually gone seconds later - the owner saw "the preview hit an error" flash up and give way to "Installing
 * dependencies" - so it is held, and shown only if it is still there once the preview is level again.
 */
export function holdsPreviewErrors(args: {
  isBuilding: boolean;
  isSettling: boolean;
  preview: Preview | null | undefined;
}): boolean {
  return args.isBuilding || args.isSettling || args.preview?.syncState === "UPDATING";
}

/**
 * How long after a frame starts loading a change of revision is taken to have been missed by it, rather than
 * delivered to it by hot reload.
 */
export const FRAME_SETTLE_MS = 8_000;

/**
 * Whether the page in the frame should be loaded again because the runner's files changed underneath it while it
 * was still loading. A page that has been up for a while gets a change by hot reload, with its state kept; that is
 * the normal case and nothing here touches it. But a page that began loading just as the dev server started, a
 * moment before the first build's files arrived, can read the old files and never hear that they changed - the dev
 * server was still taking stock of the folder, and the change went unannounced. The frame then showed the starter
 * template's placeholder under a panel saying "Up to date", for as long as nobody pressed reload.
 *
 * The tell is the revision the runner says it holds changing within a few seconds of the frame starting to load.
 * Only then is the frame reloaded, once: the reload resets when the frame started, and the revision does not change
 * again by itself.
 */
export function frameMissedAnUpdate(args: {
  loadingSince: number;
  revisionAtLoad: number | null;
  revisionNow: number | null | undefined;
  now: number;
}): boolean {
  if (args.revisionNow == null || args.revisionNow === args.revisionAtLoad) return false;
  return args.now - args.loadingSince <= FRAME_SETTLE_MS;
}

export type PreviewDevice = "desktop" | "tablet" | "mobile";

export const PREVIEW_DEVICES: readonly { device: PreviewDevice; label: string; width: number | null }[] = [
  { device: "desktop", label: "Full width", width: null },
  { device: "tablet", label: "Tablet width", width: 820 },
  { device: "mobile", label: "Phone width", width: 390 },
];

export function nextPreviewDevice(device: PreviewDevice): PreviewDevice {
  const index = PREVIEW_DEVICES.findIndex((entry) => entry.device === device);
  return PREVIEW_DEVICES[(index + 1) % PREVIEW_DEVICES.length].device;
}

export const previewDeviceWidth = (device: PreviewDevice) =>
  PREVIEW_DEVICES.find((entry) => entry.device === device)?.width ?? null;

/**
 * What the preview iframe may do. The page inside is code an AI wrote and any collaborator can open, so it gets no
 * top-level navigation (it cannot send the whole app to another address after a click), no pointer-lock and no
 * orientation or presentation control. allow-same-origin keeps it on its own preview origin, which the message check
 * and the proxy cookie both rely on; it is safe to grant only because that origin is not the app's.
 */
export const PREVIEW_SANDBOX = [
  "allow-scripts",
  "allow-same-origin",
  "allow-forms",
  "allow-popups",
  "allow-modals",
  "allow-downloads",
].join(" ");

export function previewOrigin(previewUrl: string | null | undefined): string | null {
  if (!previewUrl) return null;
  try {
    return new URL(previewUrl).origin;
  } catch {
    return null;
  }
}

export interface PreviewAddress {
  /** Host + path + hash only, safe to render as visible UI text - never carries the access token. */
  address: string;
  /** The full URL, including the access token, for "Copy link"/"Open in new tab" to actually work. */
  shareableLink: string;
}

/**
 * Combines the in-app path (reported by the previewed page's own navigation, via postMessage) with previewUrl into
 * one address, for both display and sharing.
 *
 * previewUrl carries a `?pvt=` access token (CODE_REVIEW.md SEC-06) that resolving an absolute-path reference
 * against it would otherwise silently drop - `new URL("/dashboard", "http://host/?pvt=xxx")` discards the base's
 * query string entirely, which would make every "Copy link"/"Open in new tab" hand out a URL the proxy immediately
 * rejects. This reattaches it by hand.
 */
export function previewAddressFor(path: string, previewUrl: string): PreviewAddress {
  const target = new URL(path, previewUrl);
  target.search = new URL(previewUrl).search;
  return {
    address: `${target.host}${target.pathname}${target.hash}`,
    shareableLink: target.toString(),
  };
}

export interface PreviewStartFailure {
  kind: "busy" | "failed" | "unreachable";
  title: string;
  message: string;
  hint?: string;
}

const CAPACITY_UNAVAILABLE = "CAPACITY_UNAVAILABLE";

export function describePreviewStartFailure(error: unknown): PreviewStartFailure {
  const { status, code } = (error ?? {}) as { status?: unknown; code?: unknown };
  const message = error instanceof Error && error.message ? error.message : "Something went wrong.";
  const httpStatus = typeof status === "number" ? status : 0;
  const errorCode = typeof code === "string" ? code : undefined;

  if (errorCode === CAPACITY_UNAVAILABLE) {
    return { kind: "busy", title: "Every preview runner is busy", message };
  }
  if (httpStatus === 0 || (!errorCode && [502, 503, 504].includes(httpStatus))) {
    return { kind: "unreachable", title: "The preview service isn't reachable", message };
  }
  return {
    kind: "failed",
    title: "The preview couldn't start",
    message,
    hint: "That's the preview, not your project - your files are untouched.",
  };
}

export type PreviewFailureCause = "project" | "platform";

const PROJECT_FAILURES = ["npm install failed", "The dev server stopped while starting", "The preview took more than"];

export function previewFailureCause(
  detail: string | null | undefined,
  kind?: PreviewFailureKind | null
): PreviewFailureCause {
  if (kind) return kind === "PLATFORM" ? "platform" : "project";
  return detail && PROJECT_FAILURES.some((prefix) => detail.startsWith(prefix)) ? "project" : "platform";
}

const FAILURE_TITLES: Record<PreviewFailureKind, string> = {
  INSTALL: "The project's packages couldn't be installed",
  DEV_SERVER: "The app's dev server couldn't start",
  TIMEOUT: "The preview took too long to start",
  CAPACITY: "Every preview runner is busy",
  PLATFORM: "The preview couldn't start",
};

export const previewFailureTitle = (kind: PreviewFailureKind | null | undefined) =>
  (kind && FAILURE_TITLES[kind]) || "The preview couldn't start";

export const AUTO_RETRY_DELAYS_MS = [2_000, 6_000, 15_000] as const;

export function isTransientStartError(error: unknown): boolean {
  const { status } = (error ?? {}) as { status?: unknown };
  const httpStatus = typeof status === "number" ? status : 0;
  return httpStatus === 0 || httpStatus >= 500;
}

export function autoRetryDelay(
  attempt: number,
  failure: { startError: unknown } | { detail: string | null | undefined; kind?: PreviewFailureKind | null }
): number | null {
  const delay = AUTO_RETRY_DELAYS_MS[attempt];
  if (delay === undefined) return null;
  const retryable = "startError" in failure
    ? isTransientStartError(failure.startError)
    : previewFailureCause(failure.detail, failure.kind) === "platform";
  return retryable ? delay : null;
}

export function formatStopsIn(stopsAt: string | null | undefined, now = Date.now()): string | null {
  if (!stopsAt) return null;
  const minutes = Math.max(0, Math.round((Date.parse(stopsAt) - now) / 60_000));
  if (!Number.isFinite(minutes)) return null;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
