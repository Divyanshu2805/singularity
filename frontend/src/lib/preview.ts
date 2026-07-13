import type { Preview } from "./types";

/**
 * The steps a preview goes through while starting, in order, as the server names them in `Preview.detail`
 * (`PreviewBootstrapper`). Keep in step with those strings - the checklist ticks by matching them.
 */
export const PREVIEW_STEPS = [
  { detail: "Starting a runner", label: "Starting a runner" },
  { detail: "Copying project files", label: "Copying your files" },
  { detail: "Installing dependencies", label: "Installing dependencies" },
  { detail: "Starting the dev server", label: "Starting the dev server" },
] as const;

/**
 * Which step is in progress, as an index into PREVIEW_STEPS. A restart re-runs from the install, so
 * "Restarting the dev server" lands there; anything unrecognised is treated as the first step rather than
 * guessing further along.
 */
export function previewStepIndex(detail: string | null | undefined): number {
  if (!detail) return 0;
  if (detail === "Restarting the dev server") return 2;
  const index = PREVIEW_STEPS.findIndex((step) => step.detail === detail);
  return index === -1 ? 0 : index;
}

export const isPreviewActive = (preview: Preview | null | undefined) =>
  preview?.status === "CREATING" || preview?.status === "RUNNING";

/**
 * Whether opening the Preview tab should bring a preview back by itself. Only ever *this person's own* preview that
 * ended without them choosing it - stopped for inactivity, or its runner went away - so coming back to the tab resumes
 * what they had. Never for someone who hasn't started one here (a collaborator starting theirs must not start it for
 * anyone else, and the server keeps previews per person for the same reason), never after a failure (retrying would
 * fail the same way), never over a Stop, and at most once per state so an error from the start itself (a plan limit,
 * no free runner) can't turn into a loop.
 */
export function shouldAutoStartPreview(args: {
  isVisible: boolean;
  isLoaded: boolean;
  preview: Preview | null | undefined;
  stoppedByUser: boolean;
  lastAutoStartKey: string | null;
}): boolean {
  const { isVisible, isLoaded, preview, stoppedByUser, lastAutoStartKey } = args;
  if (!isVisible || !isLoaded || stoppedByUser) return false;
  // Never started here by this person: starting is their choice.
  if (!preview || preview.status !== "TERMINATED") return false;
  // They pressed Stop - maybe in another tab, maybe before a refresh. That choice outlives this page.
  if (preview.detail === STOPPED_BY_USER) return false;
  return lastAutoStartKey !== autoStartKey(preview);
}

/** `Preview.detail` when this person pressed Stop, as opposed to the idle reaper or a deleted project (`stopPreview`). */
export const STOPPED_BY_USER = "Stopped";

export const autoStartKey = (preview: Preview | null | undefined) => (preview ? `ended-${preview.id}` : "none");

/**
 * A turn that rewrote the root package.json may have added a dependency the running dev server doesn't have - file
 * sync brings the manifest across but nothing runs npm install, so the preview has to restart to pick it up. Paths
 * arrive both with and without a leading slash (see ProjectFileServiceImpl.objectKey).
 */
export const changedDependencies = (paths: readonly string[]) =>
  paths.some((path) => path.replace(/^\/+/, "") === "package.json");

/** The origin a preview's messages must come from - anything else posting `PreviewError` is ignored. */
export function previewOrigin(previewUrl: string | null | undefined): string | null {
  if (!previewUrl) return null;
  try {
    return new URL(previewUrl).origin;
  } catch {
    return null;
  }
}

/** "4m", "1h 5m" - how long until an idle preview is stopped. */
export function formatStopsIn(stopsAt: string | null | undefined, now = Date.now()): string | null {
  if (!stopsAt) return null;
  const minutes = Math.max(0, Math.round((Date.parse(stopsAt) - now) / 60_000));
  if (!Number.isFinite(minutes)) return null;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
