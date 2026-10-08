/**
 * Covers how the build chat's stream is read: each kind of event reaching its own handler in the order it was sent,
 * and each way a stream can end being told apart - an outcome, a close with no outcome, a turn the server could not
 * save, a connection that broke part-way, a request the server refused, and one the browser gave up on itself.
 *
 * Those endings used to collapse into two - "finished" and "failed" - so a dropped connection was reported as a failed
 * turn while the server went on to save it, and a refusal because a turn was already running was dropped silently. The
 * frames here are written the way the server writes them, keep-alive comments included, and are fed in at several
 * piece sizes because a network delivers an event in whatever pieces it likes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiRequestError, GenerationFailedError, isQuotaError, StreamInterruptedError, type ChatStreamHandlers } from "./api";

const KEEP_ALIVE = ":keep-alive\n\n";

const piece = (text: string) => `data:${JSON.stringify({ text })}\n\n`;
const named = (event: string, text: string) => `event:${event}\ndata:${JSON.stringify({ text })}\n\n`;

const encode = (text: string) => new TextEncoder().encode(text);

function streamOf(text: string, pieceSize: number) {
  const bytes = encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += pieceSize) controller.enqueue(bytes.slice(i, i + pieceSize));
      controller.close();
    },
  });
}

const eventStream = (body: ReadableStream<Uint8Array>) =>
  new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function respondWith(respond: (init?: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
    String(url).endsWith("/api/auth/csrf") ? new Response(null, { status: 204 }) : respond(init)
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function watch(start: (handlers: ChatStreamHandlers) => () => void) {
  const calls: string[] = [];
  const failure: { error: Error | null } = { error: null };
  let stop: () => void = () => undefined;
  const settled = new Promise<void>((resolve) => {
    stop = start({
      onChunk: (chunk) => calls.push(`chunk:${chunk}`),
      onStatus: (line) => calls.push(`status:${line}`),
      onReplace: (text) => calls.push(`replace:${text}`),
      onDone: (outcome) => {
        calls.push(`done:${outcome}`);
        resolve();
      },
      onClosed: () => {
        calls.push("closed");
        resolve();
      },
      onError: (error) => {
        failure.error = error;
        calls.push("error");
        resolve();
      },
      onGone: () => {
        calls.push("gone");
        resolve();
      },
    });
  });
  return { calls, failure, settled, stop };
}

const send = () => watch((handlers) => api.streamChat("7", "Add a dark mode", handlers));
const resume = () => watch((handlers) => api.resumeChat("7", handlers));

const quietly = () => vi.spyOn(console, "error").mockImplementation(() => undefined);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a turn's stream, read to its outcome", () => {
  const TURN =
    piece("<message>On it.</message>") +
    named("status", "Reading 2 files") +
    KEEP_ALIVE +
    piece('<file path="src/App.tsx">\nexport default function App() {\n  return null;\n}\n</file>') +
    named("replace", "<message>On it.</message>") +
    named("status", "Saving your changes") +
    named("done", "SAVED");

  it.each([1, 7, 64, 100_000])("hands each event to its own handler, in order, whatever size the network pieces are (%i bytes)", async (pieceSize) => {
    respondWith(() => eventStream(streamOf(TURN, pieceSize)));

    const turn = send();
    await turn.settled;

    expect(turn.calls).toEqual([
      "chunk:<message>On it.</message>",
      "status:Reading 2 files",
      'chunk:<file path="src/App.tsx">\nexport default function App() {\n  return null;\n}\n</file>',
      "replace:<message>On it.</message>",
      "status:Saving your changes",
      "done:SAVED",
    ]);
  });

  it("reports the outcome without waiting for the far end to close the connection", async () => {
    const cancelled = vi.fn();
    const heldOpen = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode(piece("<message>Done.</message>") + named("done", "ANSWERED")));
      },
      cancel: cancelled,
    });
    respondWith(() => eventStream(heldOpen));

    const turn = send();
    await turn.settled;

    expect(turn.calls).toEqual(["chunk:<message>Done.</message>", "done:ANSWERED"]);
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it("reads an outcome that arrives with no line after it, as the last bytes before the close", async () => {
    respondWith(() => eventStream(streamOf(piece("Hi") + 'event:done\ndata:{"text":"STOPPED"}', 5)));

    const turn = send();
    await turn.settled;

    expect(turn.calls).toEqual(["chunk:Hi", "done:STOPPED"]);
  });

  it("clears the text when the server replaces it with nothing", async () => {
    respondWith(() => eventStream(streamOf(piece("half a fi") + named("replace", "") + named("done", "EMPTY"), 9)));

    const turn = send();
    await turn.settled;

    expect(turn.calls).toEqual(["chunk:half a fi", "replace:", "done:EMPTY"]);
  });

  it("skips what it cannot read - a payload that is not JSON, an empty piece, an event of a kind it does not know", async () => {
    const body =
      "data:not json\n\n" +
      piece("") +
      named("progress", "42%") +
      'data:{"other":"field"}\n\n' +
      piece("kept") +
      named("done", "SAVED");
    respondWith(() => eventStream(streamOf(body, 11)));

    const turn = send();
    await turn.settled;

    expect(turn.calls).toEqual(["chunk:kept", "done:SAVED"]);
  });
});

describe("a stream that ends some other way", () => {
  it("is reported as closed when it ends with no outcome, so the chat can go and ask what became of the turn", async () => {
    respondWith(() => eventStream(streamOf(piece("<message>Working on it") + KEEP_ALIVE, 13)));

    const turn = send();
    await turn.settled;

    expect(turn.calls).toEqual(["chunk:<message>Working on it", "closed"]);
  });

  it("is a failed turn when the server says it could not be saved, and nothing after that is delivered", async () => {
    quietly();
    const body =
      piece("<message>Almost") +
      named("error", "This response couldn't be saved, so nothing was changed. Please try again.") +
      piece(" there</message>") +
      named("done", "SAVED");
    respondWith(() => eventStream(streamOf(body, 100_000)));

    const turn = send();
    await turn.settled;

    expect(turn.calls).toEqual(["chunk:<message>Almost", "error"]);
    expect(turn.failure.error).toBeInstanceOf(GenerationFailedError);
    expect(turn.failure.error?.message).toBe("This response couldn't be saved, so nothing was changed. Please try again.");
  });

  it("still has something to say when that failure arrives with no text", async () => {
    quietly();
    respondWith(() => eventStream(streamOf(named("error", ""), 100_000)));

    const turn = send();
    await turn.settled;

    expect(turn.failure.error).toBeInstanceOf(GenerationFailedError);
    expect(turn.failure.error?.message).toMatch(/couldn't be saved/);
  });

  it("is an interrupted connection, not a failed turn, when reading breaks part-way", async () => {
    quietly();
    const broken = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode(piece("<message>Half")));
      },
      pull(controller) {
        controller.error(new TypeError("network error"));
      },
    });
    respondWith(() => eventStream(broken));

    const turn = send();
    await turn.settled;

    expect(turn.calls).toEqual(["chunk:<message>Half", "error"]);
    expect(turn.failure.error).toBeInstanceOf(StreamInterruptedError);
    expect(turn.failure.error).not.toBeInstanceOf(GenerationFailedError);
  });
});

describe("a request the server refuses", () => {
  it("carries the status and the server's own words when a turn is already running", async () => {
    quietly();
    respondWith(() => json(409, { status: "409 CONFLICT", message: "A response is already being generated for this project." }));

    const turn = send();
    await turn.settled;

    expect(turn.calls).toEqual(["error"]);
    expect(turn.failure.error).toBeInstanceOf(ApiRequestError);
    expect(turn.failure.error).toMatchObject({ status: 409, message: "A response is already being generated for this project." });
  });

  it("is recognisable as a spent allowance, with the details the upgrade prompt shows", async () => {
    quietly();
    const quota = { reason: "DAILY_TOKENS", limit: 100000, used: 100000, resetsAt: "2026-10-08T00:00:00Z", planName: "Free" };
    respondWith(() => json(402, { message: "You've used today's 100,000 AI tokens.", quota }));

    const turn = send();
    await turn.settled;

    expect(isQuotaError(turn.failure.error)).toBe(true);
    expect(turn.failure.error).toMatchObject({ status: 402, quota });
  });

  it("reads a gateway with nobody behind it as the server being unreachable", async () => {
    quietly();
    respondWith(() => new Response("<html>Bad Gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } }));

    const turn = send();
    await turn.settled;

    expect(turn.failure.error).toMatchObject({ status: 502 });
    expect(turn.failure.error?.message).toMatch(/Can't reach the Singularity server/);
  });

  it("says the server could not be reached when the request never lands", async () => {
    quietly();
    respondWith(() => Promise.reject(new TypeError("Failed to fetch")));

    const turn = send();
    await turn.settled;

    expect(turn.calls).toEqual(["error"]);
    expect(turn.failure.error?.message).toMatch(/Can't reach the Singularity server/);
  });
});

describe("the two ways into a stream", () => {
  it("starts a turn with a write that names the project and the message", async () => {
    const fetchMock = respondWith(() => eventStream(streamOf(named("done", "SAVED"), 100_000)));

    const turn = watch((handlers) => api.streamChat("7", "Add a dark mode", handlers));
    await turn.settled;

    const [url, init] = fetchMock.mock.calls.find(([called]) => String(called).endsWith("/api/chat/stream")) ?? [];
    expect(url).toBeDefined();
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ message: "Add a dark mode", projectId: "7" });
  });

  it("says so when the turn is asked for in teaching mode", async () => {
    const fetchMock = respondWith(() => eventStream(streamOf(named("done", "SAVED"), 100_000)));

    const turn = watch((handlers) => api.streamChat("7", "Add a dark mode", handlers, true));
    await turn.settled;

    const [, init] = fetchMock.mock.calls.find(([called]) => String(called).endsWith("/api/chat/stream")) ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({ message: "Add a dark mode", projectId: "7", teaching: true });
  });

  it("reattaches to a turn in progress with a plain read, and is told the same things", async () => {
    const fetchMock = respondWith(() =>
      eventStream(streamOf(piece("<message>Still going</message>") + named("status", "Saving your changes") + named("done", "SAVED"), 17))
    );

    const turn = resume();
    await turn.settled;

    expect(turn.calls).toEqual(["chunk:<message>Still going</message>", "status:Saving your changes", "done:SAVED"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/chat\/projects\/7\/active\/stream$/);
    expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined();
  });

  it("is told the turn is gone when there is nothing left to reattach to", async () => {
    respondWith(() => new Response(null, { status: 204 }));

    const turn = resume();
    await turn.settled;

    expect(turn.calls).toEqual(["gone"]);
  });
});

describe("a stream the browser gives up on itself", () => {
  const aborted = () => new DOMException("The operation was aborted.", "AbortError");

  it("reports nothing when it is dropped before the server answers", async () => {
    const logged = quietly();
    respondWith((init) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(aborted()));
    }));

    const turn = resume();
    await settle();
    turn.stop();
    await settle();

    expect(turn.calls).toEqual([]);
    expect(logged).not.toHaveBeenCalled();
  });

  it("reports nothing more when it is dropped part-way through", async () => {
    const logged = quietly();
    respondWith((init) => eventStream(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode(piece("<message>Half")));
        init?.signal?.addEventListener("abort", () => controller.error(aborted()));
      },
    })));

    const turn = resume();
    await settle();
    expect(turn.calls).toEqual(["chunk:<message>Half"]);

    turn.stop();
    await settle();

    expect(turn.calls).toEqual(["chunk:<message>Half"]);
    expect(logged).not.toHaveBeenCalled();
  });
});
