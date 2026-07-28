/**
 * The preview's states as the UI talks about them.
 *
 * Handles: the ordered start-up steps and which one is in progress, whether opening the tab should bring a preview
 * back by itself, the key that remembers an auto-start, detecting a dependency change that needs a restart rather
 * than a reload, the preview's own origin for message checks, turning a failure into words with a cause, and
 * formatting the idle countdown.
 *
 * The step names must match what the server writes, since the checklist ticks by matching them. Auto-start is
 * deliberately narrow: only this person's own preview that ended without them choosing it, never one a collaborator
 * started.
 */
import type { Preview } from "./types";

export const PREVIEW_STEPS = [
  { detail: "Starting a runner", label: "Starting a runner" },
  { detail: "Copying project files", label: "Copying your files" },
  { detail: "Installing dependencies", label: "Installing dependencies" },
  { detail: "Starting the dev server", label: "Starting the dev server" },
] as const;

export function previewStepIndex(detail: string | null | undefined): number {
  if (!detail) return 0;
  if (detail === "Restarting the dev server") return 2;
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

export const STOPPED_BY_USER = "Stopped";

export const autoStartKey = (preview: Preview | null | undefined) => (preview ? `ended-${preview.id}` : "none");

export const changedDependencies = (paths: readonly string[]) =>
  paths.some((path) => path.replace(/^\/+/, "") === "package.json");

export function previewOrigin(previewUrl: string | null | undefined): string | null {
  if (!previewUrl) return null;
  try {
    return new URL(previewUrl).origin;
  } catch {
    return null;
  }
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

export function formatStopsIn(stopsAt: string | null | undefined, now = Date.now()): string | null {
  if (!stopsAt) return null;
  const minutes = Math.max(0, Math.round((Date.parse(stopsAt) - now) / 60_000));
  if (!Number.isFinite(minutes)) return null;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
