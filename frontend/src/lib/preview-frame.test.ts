/**
 * Covers the conversation between the Preview tab and the page inside its frame.
 *
 * Handles: reading each message the page can post, and dropping one whose shape is wrong rather than guessing at it;
 * cutting what the page sends to a length the panel can show; keeping the console to a bounded number of lines; the
 * commands sent back; an address typed by a person only ever becoming a path on the preview's own origin; what a
 * status page calls for; and what the frame is taken to be showing - covered until the page speaks, a status page
 * when it says so, and "not the app" only when a frame that never spoke stays silent.
 */
import { describe, expect, it } from "vitest";
import {
  FRAME_LOADING,
  MAX_CONSOLE_LINES,
  addressToPath,
  appendConsole,
  errorConsoleLine,
  frameCommand,
  frameReducer,
  navigateCommand,
  readFrameMessage,
  statusPageAction,
  statusPageCaption,
  type ConsoleLine,
} from "./preview-frame";

const ORIGIN = "http://p1-abc.localhost:8090";

describe("readFrameMessage", () => {
  it("reads the page saying it is up and where it is", () => {
    expect(readFrameMessage({ type: "PreviewReady", payload: { path: "/", canGoBack: false, canGoForward: false } }))
      .toEqual({ kind: "ready", place: { path: "/", canGoBack: false, canGoForward: false } });
    expect(readFrameMessage({ type: "PreviewLocation", payload: { path: "/about?x=1#top", canGoBack: true, canGoForward: false } }))
      .toEqual({ kind: "location", place: { path: "/about?x=1#top", canGoBack: true, canGoForward: false } });
  });

  it("reads a location from a page that does not say whether it can go back, as one that cannot", () => {
    expect(readFrameMessage({ type: "PreviewLocation", payload: { path: "/about" } }))
      .toEqual({ kind: "location", place: { path: "/about", canGoBack: false, canGoForward: false } });
  });

  it("drops a location that is not a path", () => {
    expect(readFrameMessage({ type: "PreviewLocation", payload: { path: "https://evil.example/" } })).toBeNull();
    expect(readFrameMessage({ type: "PreviewLocation", payload: { path: 42 } })).toBeNull();
    expect(readFrameMessage({ type: "PreviewReady" })).toBeNull();
  });

  it("reads an error with its place, and keeps only fields of the right type", () => {
    expect(readFrameMessage({
      type: "PreviewError",
      subType: "Runtime error",
      payload: { message: "x is not defined", stack: "at App", source: "/src/App.tsx", lineno: 4, colno: "2" },
    })).toEqual({
      kind: "error",
      error: { message: "x is not defined", source: "Runtime error", stack: "at App", filename: "/src/App.tsx", lineno: 4, colno: undefined },
    });
  });

  it("gives an error with no message one, and cuts a very long one", () => {
    const unknown = readFrameMessage({ type: "PreviewError", payload: {} });
    const long = readFrameMessage({ type: "PreviewError", payload: { message: "x".repeat(50_000) } });

    expect(unknown).toMatchObject({ kind: "error", error: { message: "Unknown error" } });
    expect(long?.kind === "error" && long.error.message.length).toBe(4_000);
    expect(readFrameMessage({ type: "PreviewError" })).toBeNull();
  });

  it("reads an error going away, a blank page and a page that rendered after all", () => {
    expect(readFrameMessage({ type: "PreviewErrorCleared", subType: "Build error", payload: null })).toEqual({ kind: "error-cleared", source: "Build error" });
    expect(readFrameMessage({ type: "PreviewErrorCleared" })).toBeNull();
    expect(readFrameMessage({ type: "PreviewBlank", payload: null })).toEqual({ kind: "blank" });
    expect(readFrameMessage({ type: "PreviewRendered", payload: null })).toEqual({ kind: "rendered" });
  });

  it("reads console lines, treats an unknown level as a plain log and skips what is not a line", () => {
    expect(readFrameMessage({
      type: "PreviewConsole",
      payload: { lines: [{ level: "warn", text: "careful" }, { level: "shout", text: "hi" }, { level: "log" }, null, "nope"] },
    })).toEqual({ kind: "console", lines: [{ level: "warn", text: "careful" }, { level: "log", text: "hi" }] });
  });

  it("caps a batch of console lines however many the page claims to send", () => {
    const lines = Array.from({ length: 5_000 }, (_, index) => ({ level: "log", text: `line ${index}` }));
    const message = readFrameMessage({ type: "PreviewConsole", payload: { lines } });

    expect(message?.kind === "console" && message.lines.length).toBe(60);
    expect(readFrameMessage({ type: "PreviewConsole", payload: { lines: "all of them" } })).toBeNull();
    expect(readFrameMessage({ type: "PreviewConsole", payload: { lines: [] } })).toBeNull();
  });

  it("reads a status page only when it carries an error status", () => {
    expect(readFrameMessage({ type: "PreviewStatusPage", payload: { status: 502 } })).toEqual({ kind: "status-page", status: 502 });
    expect(readFrameMessage({ type: "PreviewStatusPage", payload: { status: 200 } })).toBeNull();
    expect(readFrameMessage({ type: "PreviewStatusPage", payload: { status: "401" } })).toBeNull();
  });

  it("ignores anything that is not one of its messages", () => {
    expect(readFrameMessage(null)).toBeNull();
    expect(readFrameMessage("PreviewReady")).toBeNull();
    expect(readFrameMessage({ type: "webpackOk" })).toBeNull();
    expect(readFrameMessage({ source: "react-devtools-bridge", payload: {} })).toBeNull();
  });
});

describe("the console's lines", () => {
  const line = (text: string): ConsoleLine => ({ level: "log", text });

  it("are kept in order and bounded, dropping the oldest", () => {
    const full = Array.from({ length: MAX_CONSOLE_LINES }, (_, index) => line(`old ${index}`));
    const next = appendConsole(full, [line("new 1"), line("new 2")]);

    expect(next).toHaveLength(MAX_CONSOLE_LINES);
    expect(next[0].text).toBe("old 2");
    expect(next[next.length - 1].text).toBe("new 2");
    expect(appendConsole([], [line("only")])).toEqual([line("only")]);
  });

  it("include an error the page threw, as an error line", () => {
    expect(errorConsoleLine({ message: "x is not defined", source: "Runtime error" }))
      .toEqual({ level: "error", text: "Runtime error: x is not defined" });
    expect(errorConsoleLine({ message: "boom" }).text).toBe("Runtime error: boom");
  });
});

describe("commands for the page", () => {
  it("are named the way the page expects", () => {
    expect(frameCommand("back")).toEqual({ type: "PreviewCommand", command: "back" });
    expect(frameCommand("forward")).toEqual({ type: "PreviewCommand", command: "forward" });
    expect(navigateCommand("/about")).toEqual({ type: "PreviewCommand", command: "navigate", path: "/about" });
  });
});

describe("addressToPath", () => {
  it("takes a path, with or without its slash, and keeps the query and hash", () => {
    expect(addressToPath("/about", ORIGIN)).toBe("/about");
    expect(addressToPath("about", ORIGIN)).toBe("/about");
    expect(addressToPath("  /items/3?tab=2#notes ", ORIGIN)).toBe("/items/3?tab=2#notes");
  });

  it("takes the preview's own address pasted back in", () => {
    expect(addressToPath("http://p1-abc.localhost:8090/settings", ORIGIN)).toBe("/settings");
    expect(addressToPath("p1-abc.localhost:8090/settings?x=1", ORIGIN)).toBe("/settings?x=1");
    expect(addressToPath("p1-abc.localhost:8090", ORIGIN)).toBe("/");
  });

  it("refuses anything that would leave the preview", () => {
    expect(addressToPath("https://evil.example/steal", ORIGIN)).toBeNull();
    expect(addressToPath("//evil.example/steal", ORIGIN)).toBeNull();
    expect(addressToPath("javascript:alert(1)", ORIGIN)).toBeNull();
    expect(addressToPath("data:text/html,<script>1</script>", ORIGIN)).toBeNull();
    expect(addressToPath("http://p1-abc.localhost:9999/", ORIGIN)).toBeNull();
  });

  it("has no answer for nothing typed, or with no preview to resolve against", () => {
    expect(addressToPath("   ", ORIGIN)).toBeNull();
    expect(addressToPath("/about", null)).toBeNull();
  });

  it("treats another site's name typed without a scheme as a path here, not as that site", () => {
    expect(addressToPath("evil.example/steal", ORIGIN)).toBe("/evil.example/steal");
  });
});

describe("what a status page calls for", () => {
  it("is a fresh link when the link ran out, the server's word when there is no route, and patience otherwise", () => {
    expect(statusPageAction(401)).toBe("fresh-link");
    expect(statusPageAction(404)).toBe("ask-server");
    expect(statusPageAction(502)).toBe("wait");
    expect(statusPageAction(503)).toBe("wait");
  });

  it("is said in a few words over the frame", () => {
    expect(statusPageCaption(401)).toBe("Refreshing the preview link");
    expect(statusPageCaption(404)).toBe("Reconnecting to the preview");
    expect(statusPageCaption(502)).toBe("The preview is restarting");
  });
});

describe("what the frame is taken to be showing", () => {
  it("is covered until the page says it is up", () => {
    expect(FRAME_LOADING.view).toBe("loading");
    expect(frameReducer(FRAME_LOADING, { type: "ready" })).toEqual({ view: "app", hasSpoken: true, status: null });
  });

  it("is a status page when the proxy says so, and the app again when the page comes back", () => {
    const restarting = frameReducer(frameReducer(FRAME_LOADING, { type: "ready" }), { type: "status-page", status: 502 });

    expect(restarting).toEqual({ view: "status-page", hasSpoken: true, status: 502 });
    expect(frameReducer(restarting, { type: "ready" }).view).toBe("app");
  });

  it("is not the app when a frame that never spoke stays silent", () => {
    expect(frameReducer(FRAME_LOADING, { type: "silence" }).view).toBe("silent");
  });

  it("is left alone by silence once the page has spoken, or while a status page is up", () => {
    const app = frameReducer(FRAME_LOADING, { type: "ready" });
    const statusPage = frameReducer(FRAME_LOADING, { type: "status-page", status: 404 });

    expect(frameReducer(app, { type: "silence" })).toBe(app);
    expect(frameReducer(statusPage, { type: "silence" })).toBe(statusPage);
  });

  it("is covered afresh on every mount, and says so when a fresh link was refused too often", () => {
    const app = frameReducer(FRAME_LOADING, { type: "ready" });

    expect(frameReducer(app, { type: "mounted" })).toEqual(FRAME_LOADING);
    expect(frameReducer({ view: "status-page", hasSpoken: false, status: 401 }, { type: "gave-up" }).view).toBe("silent");
  });
});
