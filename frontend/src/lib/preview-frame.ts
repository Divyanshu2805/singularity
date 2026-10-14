/**
 * The conversation between the Preview tab and the page inside its frame.
 *
 * Handles: reading a message the page posted into one of the things it can mean - it is up, it moved, it threw, an
 * error went away, it drew nothing, it drew something after all, it wrote to its console, it has drawn a small
 * picture of itself, the person changed some of its words by hand, or it is not the app at all but one of the proxy's
 * status pages; building the commands the tab sends back (back, forward, reload, open an address, draw a picture,
 * turn "Edit text" on or off, say whether changed words were saved); deciding when to ask for a picture and turning
 * the one that comes back into bytes; turning what a person typed into the address bar into a path on the preview's own origin; keeping the
 * console's lines to a bounded number; deciding what a status page calls for; and deciding what the frame is
 * showing, so the tab knows whether to cover it.
 *
 * The page is code an AI wrote, on another origin. The tab checks where a message came from before it gets here; this
 * checks what it says. Nothing is trusted for its shape: every field is read as the type it must be or the message is
 * dropped, text is cut to a length the panel can show, and a batch of console lines is capped however many the page
 * claims to send. The other half of the conversation is proxy/reporter.js, and the two must agree on the names.
 *
 * A picture is what a project's card shows in place of its colours. It is asked for once per saved state of the
 * project, a moment after the page has settled, and only when the picture would be worth keeping: the app is up and
 * level with the project, nothing is being built, no error is showing, the page is the app's first page, and the
 * person may edit the project - a viewer's browser never sends one. What comes back is the page's own claim, so it
 * is taken only as a WebP or JPEG data URL of a believable length; the server checks the bytes again.
 *
 * An address typed by a person can only ever be a path. Whatever they type - a full URL, another site, a scheme - is
 * resolved against the preview's origin and refused if it leaves it, so the bar cannot be used to load something else
 * into the frame under the preview's cookie.
 *
 * A frame that has loaded and said nothing is not assumed to be working. The page's first act is to say it is up; a
 * status page says which one it is. Silence after a load means neither, and after a while the tab says so instead of
 * leaving a blank rectangle for the person to interpret. Once a page has spoken, silence from a later navigation is
 * left alone - an app may open a PDF or an image in its own frame, and that is not a failure.
 */
import type { RuntimeError } from "./preview-fix";
import { readTextEdit, type TextEdit } from "./text-edit";

export interface FramePlace {
  path: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

export type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";

export interface ConsoleLine {
  level: ConsoleLevel;
  text: string;
}

export type FrameMessage =
  | { kind: "ready"; place: FramePlace }
  | { kind: "location"; place: FramePlace }
  | { kind: "error"; error: RuntimeError }
  | { kind: "error-cleared"; source: string }
  | { kind: "blank" }
  | { kind: "rendered" }
  | { kind: "console"; lines: ConsoleLine[] }
  | { kind: "snapshot"; dataUrl: string }
  | { kind: "text-edit"; edit: TextEdit }
  | { kind: "status-page"; status: number };

const MAX_PATH_CHARS = 2_000;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_STACK_CHARS = 8_000;
const MAX_LINE_CHARS = 4_000;
const MAX_LINES_PER_MESSAGE = 60;
const LEVELS: readonly ConsoleLevel[] = ["log", "info", "warn", "error", "debug"];

export const MAX_CONSOLE_LINES = 300;
export const MAX_SNAPSHOT_CHARS = 400_000;
const SNAPSHOT_URL = /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/]+=*$/;

const text = (value: unknown, max: number): string | undefined =>
  typeof value === "string" ? value.slice(0, max) : undefined;

const count = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

function place(payload: Record<string, unknown> | undefined): FramePlace | null {
  const path = text(payload?.path, MAX_PATH_CHARS);
  if (!path || !path.startsWith("/")) return null;
  return { path, canGoBack: payload?.canGoBack === true, canGoForward: payload?.canGoForward === true };
}

export function readFrameMessage(data: unknown): FrameMessage | null {
  if (!data || typeof data !== "object") return null;
  const { type, subType, payload: rawPayload } = data as { type?: unknown; subType?: unknown; payload?: unknown };
  const payload = rawPayload && typeof rawPayload === "object" ? (rawPayload as Record<string, unknown>) : undefined;

  switch (type) {
    case "PreviewReady":
    case "PreviewLocation": {
      const where = place(payload);
      return where ? { kind: type === "PreviewReady" ? "ready" : "location", place: where } : null;
    }
    case "PreviewError":
      if (!payload) return null;
      return {
        kind: "error",
        error: {
          message: text(payload.message, MAX_MESSAGE_CHARS) || "Unknown error",
          source: text(subType, 60),
          stack: text(payload.stack, MAX_STACK_CHARS),
          filename: text(payload.source, MAX_PATH_CHARS),
          lineno: count(payload.lineno),
          colno: count(payload.colno),
        },
      };
    case "PreviewErrorCleared": {
      const source = text(subType, 60);
      return source ? { kind: "error-cleared", source } : null;
    }
    case "PreviewBlank":
      return { kind: "blank" };
    case "PreviewRendered":
      return { kind: "rendered" };
    case "PreviewConsole": {
      if (!Array.isArray(payload?.lines)) return null;
      const lines: ConsoleLine[] = [];
      for (const entry of payload.lines.slice(0, MAX_LINES_PER_MESSAGE)) {
        const line = entry as { level?: unknown; text?: unknown } | null;
        const words = text(line?.text, MAX_LINE_CHARS);
        if (words === undefined) continue;
        lines.push({ level: LEVELS.includes(line?.level as ConsoleLevel) ? (line?.level as ConsoleLevel) : "log", text: words });
      }
      return lines.length > 0 ? { kind: "console", lines } : null;
    }
    case "PreviewSnapshot": {
      const dataUrl = typeof payload?.dataUrl === "string" ? payload.dataUrl : "";
      return dataUrl.length > 0 && dataUrl.length <= MAX_SNAPSHOT_CHARS && SNAPSHOT_URL.test(dataUrl)
        ? { kind: "snapshot", dataUrl }
        : null;
    }
    case "PreviewTextEdit": {
      const edit = readTextEdit(payload);
      return edit ? { kind: "text-edit", edit } : null;
    }
    case "PreviewStatusPage": {
      const status = count(payload?.status);
      return status !== undefined && status >= 400 && status <= 599 ? { kind: "status-page", status } : null;
    }
    default:
      return null;
  }
}

export function appendConsole(
  buffer: readonly ConsoleLine[],
  lines: readonly ConsoleLine[],
  max = MAX_CONSOLE_LINES
): ConsoleLine[] {
  const next = [...buffer, ...lines];
  return next.length > max ? next.slice(next.length - max) : next;
}

export const errorConsoleLine = (error: RuntimeError): ConsoleLine => ({
  level: "error",
  text: `${error.source ?? "Runtime error"}: ${error.message}`,
});

export type FrameCommand =
  | { type: "PreviewCommand"; command: "back" | "forward" | "reload" | "snapshot" }
  | { type: "PreviewCommand"; command: "navigate"; path: string }
  | { type: "PreviewCommand"; command: "edit-text"; on: boolean }
  | { type: "PreviewCommand"; command: "edit-text-saved"; id: number; saved: boolean };

export const frameCommand = (command: "back" | "forward" | "reload" | "snapshot"): FrameCommand => ({ type: "PreviewCommand", command });

/** The bytes of a picture the page sent, as the file to upload; null when the data URL does not decode. */
export function snapshotBlob(dataUrl: string): Blob | null {
  const match = SNAPSHOT_URL.exec(dataUrl);
  if (!match) return null;
  try {
    const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: `image/${match[1]}` });
  } catch {
    return null;
  }
}

/** Whether now is a moment to ask the page for a picture of itself. */
export function wantsSnapshot(now: {
  canEdit: boolean;
  isRunning: boolean;
  isShowingApp: boolean;
  isLevel: boolean;
  isBuilding: boolean;
  hasError: boolean;
  path: string;
}): boolean {
  return now.canEdit && now.isRunning && now.isShowingApp && now.isLevel && !now.isBuilding && !now.hasError && now.path === "/";
}

export const navigateCommand = (path: string): FrameCommand => ({ type: "PreviewCommand", command: "navigate", path });

export const editTextCommand = (on: boolean): FrameCommand => ({ type: "PreviewCommand", command: "edit-text", on });

export const editSavedCommand = (id: number, saved: boolean): FrameCommand =>
  ({ type: "PreviewCommand", command: "edit-text-saved", id, saved });

/**
 * The path a person meant by what they typed into the address bar, or null when it would leave the preview. Accepts
 * a bare path ("about"), an absolute one ("/about?x=1#top"), or the preview's own full address pasted back in.
 */
export function addressToPath(input: string, origin: string | null): string | null {
  const typed = input.trim();
  if (!origin || !typed) return null;
  const host = new URL(origin).host;
  let candidate = typed;
  if (typed === host || typed.startsWith(`${host}/`)) {
    candidate = typed.slice(host.length) || "/";
  } else if (!/^[a-z][a-z0-9+.-]*:/i.test(typed) && !typed.startsWith("/")) {
    candidate = `/${typed}`;
  }
  if (candidate.startsWith("//")) return null;
  try {
    const target = new URL(candidate, origin);
    if (target.origin !== origin) return null;
    return `${target.pathname}${target.search}${target.hash}`.slice(0, MAX_PATH_CHARS);
  } catch {
    return null;
  }
}

export type StatusPageAction = "fresh-link" | "ask-server" | "wait";

/**
 * What the tab should do about a status page in the frame. A 401 means the access link has run out - six hours
 * after it was issued - and a fresh one fixes it without the person doing anything. A 404 means the proxy has no
 * route: the preview stopped or is restarting, and the server knows which. Anything else is the runner not
 * answering yet, which the page retries by itself; the server is still asked, in case the runner has gone for good.
 */
export function statusPageAction(status: number): StatusPageAction {
  if (status === 401 || status === 403) return "fresh-link";
  if (status === 404) return "ask-server";
  return "wait";
}

export const statusPageCaption = (status: number): string =>
  statusPageAction(status) === "fresh-link" ? "Refreshing the preview link"
    : status === 404 ? "Reconnecting to the preview"
      : "The preview is restarting";

export type FrameView = "loading" | "app" | "status-page" | "silent";

export const FRAME_SILENCE_MS = 12_000;

export interface FrameState {
  view: FrameView;
  hasSpoken: boolean;
  status: number | null;
}

export const FRAME_LOADING: FrameState = { view: "loading", hasSpoken: false, status: null };

export type FrameEvent =
  | { type: "mounted" }
  | { type: "ready" }
  | { type: "status-page"; status: number }
  | { type: "silence" }
  | { type: "gave-up" };

export function frameReducer(state: FrameState, event: FrameEvent): FrameState {
  switch (event.type) {
    case "mounted":
      return FRAME_LOADING;
    case "gave-up":
      return { ...state, view: "silent" };
    case "ready":
      return { view: "app", hasSpoken: true, status: null };
    case "status-page":
      return { view: "status-page", hasSpoken: state.hasSpoken, status: event.status };
    case "silence":
      return state.view === "loading" && !state.hasSpoken ? { ...state, view: "silent" } : state;
  }
}
