/**
 * Covers the chat store's handling of a build turn from the first chunk to the saved result.
 *
 * While an answer streams: a half-written file's content is kept so it never has to be fetched mid-response, a
 * finished file moves from streaming to completed, a file holding a generic named like a tag is still a file, and a
 * file the server takes back - cut off half-way, before it carries the reply on - stops being shown.
 *
 * When it ends: the saved turn replaces the browser's own reading of the text, including which files exist, since the
 * two once disagreed and the chat showed a file the server had discarded. A turn is never sent again automatically;
 * a refused request says why instead of vanishing; a dropped connection reattaches to the turn that is still running
 * rather than calling it failed; and a stopped turn ends up as the server recorded it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("./api", () => ({
  ApiRequestError: class ApiRequestError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  },
  GenerationFailedError: class GenerationFailedError extends Error {},
  StreamInterruptedError: class StreamInterruptedError extends Error {},
  getUserInfo: () => ({ id: 7, username: "ada@example.com", name: "Ada" }),
  api: {
    streamChat: vi.fn(),
    getFileContent: vi.fn(() => Promise.resolve("")),
    getChatHistory: vi.fn(() => Promise.resolve([])),
    getActiveGeneration: vi.fn(() => Promise.resolve(null)),
    stopGeneration: vi.fn(() => Promise.resolve()),
    resumeChat: vi.fn(() => () => undefined),
    getLastTurnChanges: vi.fn(() => Promise.resolve({ files: [] })),
  },
}));

import { api, ApiRequestError, GenerationFailedError, StreamInterruptedError, type ChatStreamHandlers } from "./api";
import { isWorthRetrying, projectChat, STILL_WORKING_NOTICE, turnOutcome, useProjectChat } from "./project-chat-store";
import { ChatEventType, type ChatEvent } from "./types";

const PROMPT = "build me a todo app";

const streams: ChatStreamHandlers[] = [];
const resumes: ChatStreamHandlers[] = [];
let abortedStreams = 0;

const lastStream = () => streams[streams.length - 1];
const lastResume = () => resumes[resumes.length - 1];

function captureStreams() {
  streams.length = 0;
  resumes.length = 0;
  abortedStreams = 0;
  vi.mocked(api.streamChat).mockImplementation(((_projectId: string, _message: string, handlers: ChatStreamHandlers) => {
    streams.push(handlers);
    return () => { abortedStreams += 1; };
  }) as typeof api.streamChat);
  vi.mocked(api.resumeChat).mockImplementation(((_projectId: string, handlers: ChatStreamHandlers) => {
    resumes.push(handlers);
    return () => undefined;
  }) as typeof api.resumeChat);
}

function startResponse(projectId: string): ChatStreamHandlers {
  captureStreams();
  act(() => projectChat.sendMessage(projectId, PROMPT));
  return lastStream();
}

const savedEvent = (type: ChatEventType, content: string, extra: Partial<ChatEvent> = {}) => ({ type, content, ...extra });

const savedTurn = (events: ChatEvent[], outcome = "SAVED") => [
  { id: 1, role: "USER", content: PROMPT, createdAt: "2026-09-16T10:00:00Z", events: [] },
  {
    id: 2,
    role: "ASSISTANT",
    content: "",
    createdAt: "2026-09-16T10:00:20Z",
    events: [savedEvent(ChatEventType.THOUGHT, "Worked for 20s", { metadata: outcome }), ...events],
  },
];

const serverSaved = (events: ChatEvent[], outcome = "SAVED") =>
  vi.mocked(api.getChatHistory).mockResolvedValue(savedTurn(events, outcome) as never);

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

const resolve = (state: { completedFiles: ReadonlyMap<string, string>; streamingFiles: ReadonlyMap<string, string> }, path: string) =>
  state.completedFiles.get(path) ?? state.streamingFiles.get(path);

let projectId: string;

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  vi.mocked(api.getFileContent).mockResolvedValue("");
  vi.mocked(api.getChatHistory).mockResolvedValue([]);
  vi.mocked(api.getActiveGeneration).mockResolvedValue(null);
  vi.mocked(api.stopGeneration).mockResolvedValue(undefined);
  projectId = `project-${Math.random()}`;
});

describe("the files a turn is writing", () => {
  it("keeps a half-written file's content, so it never has to be fetched mid-response", () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);

    act(() => stream.onChunk('<file path="src/components/TodoItem.tsx">export function TodoItem('));
    expect(resolve(result.current, "src/components/TodoItem.tsx")).toBe("export function TodoItem(");

    act(() => stream.onChunk(") {\n  return null;"));
    expect(resolve(result.current, "src/components/TodoItem.tsx")).toBe("export function TodoItem() {\n  return null;");
  });

  it("has content for a file the moment its tag opens, before any body has arrived", () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);

    act(() => stream.onChunk('<file path="src/components/TodoList.tsx">'));
    expect(resolve(result.current, "src/components/TodoList.tsx")).toBe("");
  });

  it("moves a finished file out of streaming and into completed", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);

    act(() => stream.onChunk('<file path="src/App.tsx">export default'));
    await act(async () => stream.onChunk(" App;</file>"));

    expect(result.current.streamingFiles.has("src/App.tsx")).toBe(false);
    expect(result.current.completedFiles.get("src/App.tsx")).toBe("export default App;\n");
    expect(result.current.lastTurnFiles).toEqual(["src/App.tsx"]);
  });

  it("still sees a file whose content holds a generic named like a tag", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);

    await act(async () => stream.onChunk(
      '<todo path="src/hooks/useTodos.ts">Creating the hook</todo><file path="src/hooks/useTodos.ts">const [todos] = useState<Todo[]>([]);</file>'
    ));

    expect(result.current.completedFiles.get("src/hooks/useTodos.ts")).toBe("const [todos] = useState<Todo[]>([]);\n");
  });

  it("stops showing a half-written file when the server takes it back before carrying on", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    const kept = '<file path="src/a.ts">export const a = 1;</file>';

    await act(async () => stream.onChunk(kept + '<file path="src/b.ts">export const b'));
    expect(result.current.streamingFiles.get("src/b.ts")).toBe("export const b");

    await act(async () => stream.onReplace(kept));

    expect(result.current.streamingFiles.size).toBe(0);
    expect(result.current.completedFiles.get("src/a.ts")).toBe("export const a = 1;\n");
    expect(result.current.messages[1].content).toBe(kept);
    expect(result.current.messages[1].instantLength).toBe(kept.length);
  });

  it("takes a deleted file out of the tree, and puts it back if the turn writes it again", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const first = startResponse(projectId);
    await act(async () => first.onChunk('<file path="src/Old.tsx">export default 1;</file>'));
    serverSaved([savedEvent(ChatEventType.FILE_EDIT, "export default 1;\n", { filePath: "src/Old.tsx" })]);
    await act(async () => first.onDone("SAVED"));
    await flush();

    const second = startResponse(projectId);
    await act(async () => second.onChunk('<delete path="src/Old.tsx">Not needed</delete>'));
    expect(result.current.deletedFiles.has("src/Old.tsx")).toBe(true);
    expect(result.current.completedFiles.has("src/Old.tsx")).toBe(false);

    await act(async () => second.onChunk('<file path="src/Old.tsx">export default 2;</file>'));
    expect(result.current.deletedFiles.has("src/Old.tsx")).toBe(false);
    expect(result.current.completedFiles.get("src/Old.tsx")).toBe("export default 2;\n");
  });

  it("goes back to the files as they were when a response fails", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    await act(async () => stream.onChunk('<file path="src/Done.tsx">finished</file><file path="src/Broken.tsx">half a file'));

    act(() => stream.onError(new GenerationFailedError("This response couldn't be saved, so nothing was changed.")));

    expect(resolve(result.current, "src/Broken.tsx")).toBeUndefined();
    expect(resolve(result.current, "src/Done.tsx")).toBeUndefined();
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages[1].error).toContain("couldn't be saved");
    expect(result.current.messages[1].notSent).toBe(false);
  });

  it("starts the next turn with the previous one's half-written files gone and its finished ones kept", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const first = startResponse(projectId);
    await act(async () => first.onChunk('<file path="src/Done.tsx">finished</file>'));
    serverSaved([savedEvent(ChatEventType.FILE_EDIT, "finished\n", { filePath: "src/Done.tsx" })]);
    await act(async () => first.onDone("SAVED"));
    await flush();

    startResponse(projectId);
    expect(result.current.streamingFiles.size).toBe(0);
    expect(result.current.completedFiles.get("src/Done.tsx")).toBe("finished\n");
  });
});

describe("what the server says while it works", () => {
  it("shows the server's status line, and drops it as soon as more of the answer arrives", () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);

    act(() => stream.onStatus("Reading 2 files"));
    expect(result.current.messages[1].status).toBe("Reading 2 files");

    act(() => stream.onChunk("<message>Found it.</message>"));
    expect(result.current.messages[1].status).toBeUndefined();
  });
});

describe("when a turn ends", () => {
  it("stamps a time on both messages and measures how long the answer took", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T10:00:00Z"));
    try {
      const { result } = renderHook(() => useProjectChat(projectId));
      const stream = startResponse(projectId);
      expect(result.current.messages[0].createdAt).toBe("2026-09-16T10:00:00.000Z");

      vi.setSystemTime(new Date("2026-09-16T10:00:07Z"));
      act(() => stream.onDone("ANSWERED"));

      const answer = result.current.messages[1];
      expect(answer.thoughtSeconds).toBe(7);
      expect(answer.createdAt).toBe("2026-09-16T10:00:07.000Z");
      expect(answer.outcome).toBe("ANSWERED");
      expect(result.current.isStreaming).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("replaces its own reading of the answer with the turn the server saved", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    await act(async () => stream.onChunk('<message>On it.</message><file path="src/App.tsx">export default 1;</file>'));
    const liveIds = result.current.messages.map((message) => message.id);
    serverSaved([
      savedEvent(ChatEventType.MESSAGE, "On it."),
      savedEvent(ChatEventType.FILE_EDIT, "export default 1;\n", { filePath: "src/App.tsx" }),
    ]);

    await act(async () => stream.onDone("SAVED"));
    await flush();

    const answer = result.current.messages[1];
    expect(result.current.messages.map((message) => message.id)).toEqual(liveIds);
    expect(answer.events?.map((event) => event.type)).toEqual([ChatEventType.THOUGHT, ChatEventType.MESSAGE, ChatEventType.FILE_EDIT]);
    expect(answer.content).toBe("");
    expect(answer.outcome).toBe("SAVED");
    expect(result.current.hasUnsavedTurn).toBe(false);
    expect(result.current.lastTurnFiles).toEqual(["src/App.tsx"]);
  });

  it("stops showing a file it read out of the answer when the server did not save it", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    await act(async () => stream.onChunk('<file path="src/Kept.tsx">kept</file><file path="src/Lost.tsx">lost</file>'));
    expect(result.current.completedFiles.has("src/Lost.tsx")).toBe(true);
    serverSaved([savedEvent(ChatEventType.FILE_EDIT, "kept\n", { filePath: "src/Kept.tsx" })]);

    await act(async () => stream.onDone("SAVED"));
    await flush();

    expect(result.current.completedFiles.has("src/Lost.tsx")).toBe(false);
    expect(result.current.completedFiles.get("src/Kept.tsx")).toBe("kept\n");
    expect(result.current.lastTurnFiles).toEqual(["src/Kept.tsx"]);
  });

  it("keeps showing the answer while the saved copy is not there yet", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    act(() => stream.onChunk("<message>Done.</message>"));
    vi.mocked(api.getChatHistory).mockResolvedValue([
      { id: 1, role: "USER", content: PROMPT, createdAt: "2026-09-16T10:00:00Z", events: [] },
      { id: 2, role: "ASSISTANT", content: "", createdAt: "2026-09-16T10:00:20Z", events: [] },
    ] as never);

    act(() => stream.onDone("ANSWERED"));
    await act(() => projectChat.loadHistory(projectId));

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].content).toContain("Done.");
    expect(result.current.hasUnsavedTurn).toBe(true);
  });

  it("never sends the request again by itself, even when the answer stopped short of its plan", async () => {
    renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    await act(async () => stream.onChunk(
      '<todo path="src/a.tsx">One</todo><todo path="src/b.tsx">Two</todo><file path="src/a.tsx">const a = 1;</file>'
    ));

    act(() => stream.onDone("INCOMPLETE"));

    expect(vi.mocked(api.streamChat)).toHaveBeenCalledTimes(1);
  });

  it("offers a retry on a turn the server recorded as anything but done, and remembers that after a reload", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    serverSaved([savedEvent(ChatEventType.MESSAGE, "This answer stopped before it finished.")], "INCOMPLETE");

    await act(() => projectChat.loadHistory(projectId));

    expect(result.current.messages[1].outcome).toBe("INCOMPLETE");
    expect(isWorthRetrying(result.current.messages[1].outcome)).toBe(true);

    captureStreams();
    act(() => projectChat.retryLastMessage(projectId));
    expect(vi.mocked(api.streamChat).mock.calls[0][1]).toBe(PROMPT);
  });
});

describe("how a turn is recorded as having ended", () => {
  it("is read off the turn's first saved event", () => {
    expect(turnOutcome([savedEvent(ChatEventType.THOUGHT, "Worked for 3s", { metadata: "STOPPED" })])).toBe("STOPPED");
    expect(turnOutcome([savedEvent(ChatEventType.THOUGHT, "Worked for 3s")])).toBeUndefined();
    expect(turnOutcome([savedEvent(ChatEventType.THOUGHT, "Worked for 3s", { metadata: "something else" })])).toBeUndefined();
    expect(turnOutcome(undefined)).toBeUndefined();
  });

  it("is worth retrying unless the turn saved or simply answered", () => {
    expect(isWorthRetrying("SAVED")).toBe(false);
    expect(isWorthRetrying("ANSWERED")).toBe(false);
    expect(isWorthRetrying(undefined)).toBe(false);
    for (const outcome of ["INCOMPLETE", "NOT_SAVED", "EMPTY", "FAILED", "STOPPED", "OUT_OF_BUDGET"] as const) {
      expect(isWorthRetrying(outcome)).toBe(true);
    }
  });
});

describe("a request the server refuses", () => {
  it("says why and removes the placeholder when a response is already being generated", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    expect(result.current.messages).toHaveLength(2);

    await act(async () => stream.onError(new ApiRequestError("Someone is already generating a response for this project.", 409)));

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.notice).toContain("already generating");
    expect(vi.mocked(api.getChatHistory)).toHaveBeenCalled();

    act(() => projectChat.dismissNotice(projectId));
    expect(result.current.notice).toBeNull();
  });

  it("joins the response already running when it is this person's own", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    vi.mocked(api.getActiveGeneration).mockResolvedValue({
      userMessage: "an earlier request", startedAt: new Date().toISOString(), status: "RUNNING",
    });

    await act(async () => stream.onError(new ApiRequestError("Someone is already generating a response for this project.", 409)));
    await flush();

    expect(resumes).toHaveLength(1);
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.messages.map((message) => message.content)).toEqual(["an earlier request", ""]);
  });

  it("does not send a second request while one is in progress, and says so", () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    startResponse(projectId);

    act(() => projectChat.sendMessage(projectId, "fix this error"));

    expect(vi.mocked(api.streamChat)).toHaveBeenCalledTimes(1);
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.notice).toBe(STILL_WORKING_NOTICE);
  });
});

describe("stopping and retrying", () => {
  it("stops the response, undoes the files it was showing, and ends up with the turn as the server recorded it", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    await act(async () => stream.onChunk('<message>On it.</message><file path="src/App.tsx">export default 1;</file>'));
    serverSaved([
      savedEvent(ChatEventType.MESSAGE, "On it."),
      savedEvent(ChatEventType.MESSAGE, "This response was stopped, so none of its changes were saved."),
    ], "STOPPED");

    act(() => projectChat.stopStreaming(projectId));

    expect(abortedStreams).toBe(1);
    expect(vi.mocked(api.stopGeneration)).toHaveBeenCalledWith(projectId);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages[1].wasStopped).toBe(true);
    expect(result.current.completedFiles.has("src/App.tsx")).toBe(false);

    await flush();

    expect(result.current.messages[1].outcome).toBe("STOPPED");
    expect(result.current.messages[1].events?.at(-1)?.content).toContain("stopped");
    expect(result.current.completedFiles.has("src/App.tsx")).toBe(false);
    expect(vi.mocked(api.streamChat)).toHaveBeenCalledTimes(1);
  });

  it("keeps the files when the stop arrived too late and the server had already saved the turn", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    await act(async () => stream.onChunk('<file path="src/App.tsx">export default 1;</file>'));
    serverSaved([savedEvent(ChatEventType.FILE_EDIT, "export default 1;\n", { filePath: "src/App.tsx" })], "SAVED");

    act(() => projectChat.stopStreaming(projectId));
    await flush();

    expect(result.current.messages[1].outcome).toBe("SAVED");
    expect(result.current.messages[1].wasStopped).toBeUndefined();
    expect(result.current.completedFiles.get("src/App.tsx")).toBe("export default 1;\n");
  });

  it("sends the same message again on an explicit retry", () => {
    renderHook(() => useProjectChat(projectId));
    startResponse(projectId);
    act(() => projectChat.stopStreaming(projectId));

    act(() => projectChat.retryLastMessage(projectId));

    expect(vi.mocked(api.streamChat)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.streamChat).mock.calls[1][1]).toBe(PROMPT);
  });
});

describe("a connection that drops while the turn carries on", () => {
  afterEach(() => vi.useRealTimers());

  it("reattaches to the turn when the stream breaks and the server is still generating", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    act(() => stream.onChunk("<message>Half an ans"));
    vi.mocked(api.getActiveGeneration).mockResolvedValue({
      userMessage: PROMPT, startedAt: new Date().toISOString(), status: "RUNNING",
    });

    await act(async () => stream.onError(new StreamInterruptedError()));
    await flush();

    expect(resumes).toHaveLength(1);
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].error).toBeUndefined();

    act(() => lastResume().onChunk("<message>Half an answer, then the rest.</message>"));
    expect(result.current.messages[1].content).toBe("<message>Half an answer, then the rest.</message>");
    expect(result.current.messages[1].instantLength).toBe(result.current.messages[1].content.length);
  });

  it("collects the saved turn when the stream closed without an outcome and the turn has since finished", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    act(() => stream.onChunk("<message>Done.</message>"));
    serverSaved([savedEvent(ChatEventType.MESSAGE, "Done.")], "ANSWERED");

    await act(async () => stream.onClosed());
    await flush();

    expect(resumes).toHaveLength(0);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages[1].outcome).toBe("ANSWERED");
    expect(result.current.messages[1].events).toHaveLength(2);
  });

  it("says the connection was lost only after it has really given up", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    vi.mocked(api.getActiveGeneration).mockRejectedValue(new Error("Can't reach the Singularity server."));

    await act(async () => {
      stream.onError(new StreamInterruptedError());
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages[1].error).toContain("connection was lost");
    expect(vi.mocked(api.getActiveGeneration).mock.calls.length).toBeGreaterThan(3);
    expect(JSON.parse(localStorage.getItem(`failed_prompt_7_${projectId}`)!)).toMatchObject({ content: PROMPT, notSent: false });
  });

  const loseTheTurn = async () => {
    vi.useFakeTimers();
    const rendered = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    act(() => stream.onChunk("<message>Half an ans"));
    await act(async () => {
      stream.onClosed();
      await vi.advanceTimersByTimeAsync(30_000);
    });
    vi.useRealTimers();
    return rendered.result;
  };

  const reloadPage = async () => {
    const reloaded = `reload-${Math.random()}`;
    localStorage.setItem(`failed_prompt_7_${reloaded}`, localStorage.getItem(`failed_prompt_7_${projectId}`)!);
    projectId = reloaded;
    const { result } = renderHook(() => useProjectChat(reloaded));
    await act(() => projectChat.loadHistory(reloaded));
    return result;
  };

  it("says the turn was interrupted, and keeps the question, when the server has no trace of it", async () => {
    const result = await loseTheTurn();

    expect(resumes).toHaveLength(0);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages[1].error).toContain("interrupted before it could be saved");
    expect(result.current.messages[1].notSent).toBe(false);
    const kept = JSON.parse(localStorage.getItem(`failed_prompt_7_${projectId}`)!);
    expect(kept).toMatchObject({ content: PROMPT, notSent: false });
    expect(kept.error).toContain("interrupted before it could be saved");
  });

  it("brings that question back after a reload, with the reason and a retry that sends it again", async () => {
    await loseTheTurn();

    const result = await reloadPage();

    expect(result.current.messages.map((message) => [message.role, message.content])).toEqual([["user", PROMPT], ["assistant", ""]]);
    expect(result.current.messages[1].error).toContain("interrupted before it could be saved");
    expect(result.current.messages[1].notSent).toBe(false);

    captureStreams();
    act(() => projectChat.retryLastMessage(projectId));
    expect(vi.mocked(api.streamChat).mock.calls[0][1]).toBe(PROMPT);
    expect(localStorage.getItem(`failed_prompt_7_${projectId}`)).toBeNull();
  });

  it("drops the kept question when a reload finds the turn was saved after all", async () => {
    await loseTheTurn();
    vi.mocked(api.getChatHistory).mockResolvedValue([
      { id: 1, role: "USER", content: PROMPT, createdAt: new Date().toISOString(), events: [] },
      { id: 2, role: "ASSISTANT", content: "", createdAt: new Date().toISOString(), events: [
        savedEvent(ChatEventType.THOUGHT, "Worked for 41s", { metadata: "FAILED" }),
        savedEvent(ChatEventType.MESSAGE, "The server restarted while this was being generated, so none of its changes were saved."),
      ] },
    ] as never);

    const result = await reloadPage();

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].outcome).toBe("FAILED");
    expect(result.current.messages[1].error).toBeUndefined();
    expect(localStorage.getItem(`failed_prompt_7_${projectId}`)).toBeNull();
  });

  it("does not reattach to a turn that was stopped while it was reconnecting", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    let answer: (active: unknown) => void = () => undefined;
    vi.mocked(api.getActiveGeneration).mockReturnValueOnce(new Promise((settle) => { answer = settle; }) as never);

    act(() => stream.onError(new StreamInterruptedError()));
    act(() => projectChat.stopStreaming(projectId));
    await act(async () => answer({ userMessage: PROMPT, startedAt: new Date().toISOString(), status: "RUNNING" }));
    await flush();

    expect(resumes).toHaveLength(0);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages[1].wasStopped).toBe(true);
  });

  it("leaves the next turn alone when a reconnect outlives the turn it was for", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    let answer: (active: null) => void = () => undefined;
    vi.mocked(api.getActiveGeneration).mockReturnValueOnce(new Promise((settle) => { answer = settle; }) as never);

    act(() => stream.onClosed());
    act(() => projectChat.stopStreaming(projectId));
    act(() => { projectChat.sendMessage(projectId, "something else"); });
    await act(async () => answer(null));
    await flush();

    expect(result.current.isStreaming).toBe(true);
    expect(result.current.messages.at(-1)).toMatchObject({ role: "assistant", isStreaming: true });
    expect(result.current.messages.at(-1)?.error).toBeUndefined();
    expect(localStorage.getItem(`failed_prompt_7_${projectId}`)).toBeNull();
  });
});

describe("after a refresh mid-response", () => {
  const active = {
    userMessage: PROMPT,
    startedAt: new Date(Date.now() - 20_000).toISOString(),
   
    status: "RUNNING" as const,
  };

  beforeEach(() => captureStreams());

  it("puts the question back and follows the answer from where the server has got to", async () => {
    const saved = [{ id: 1, role: "USER", content: "earlier question", createdAt: new Date(Date.now() - 600_000).toISOString(), events: [] }];
    vi.mocked(api.getChatHistory).mockResolvedValue(saved as never);
    vi.mocked(api.getActiveGeneration).mockResolvedValue(active);
    const { result } = renderHook(() => useProjectChat(projectId));

    await act(() => projectChat.loadHistory(projectId));

    expect(api.resumeChat).toHaveBeenCalledTimes(1);
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.messages.map((message) => [message.role, message.content])).toEqual([
      ["user", "earlier question"],
      ["user", PROMPT],
      ["assistant", ""],
    ]);

    await act(async () => lastResume().onChunk('<message>On it</message><file path="src/App.tsx">done</file>'));
    expect(result.current.messages[2].content).toContain("On it");
    expect(result.current.messages[2].instantLength).toBe(result.current.messages[2].content.length);
    act(() => lastResume().onChunk("<message>more</message>"));
    expect(result.current.messages[2].instantLength).toBeLessThan(result.current.messages[2].content.length);
    expect(result.current.completedFiles.get("src/App.tsx")).toBe("done\n");

    act(() => lastResume().onStatus("Saving your changes"));
    expect(result.current.messages[2].status).toBe("Saving your changes");

    act(() => lastResume().onDone("SAVED"));
    expect(result.current.isStreaming).toBe(false);
  });

  it("does not show a turn twice when it finished saving between the check and the history read", async () => {
    vi.mocked(api.getActiveGeneration).mockResolvedValue(active);
    vi.mocked(api.getChatHistory).mockResolvedValue([
      { id: 1, role: "USER", content: active.userMessage, createdAt: new Date().toISOString(), events: [] },
      { id: 2, role: "ASSISTANT", content: "", createdAt: new Date().toISOString(), events: [{ id: 1, type: "MESSAGE", content: "Done" }] },
    ] as never);
    const { result } = renderHook(() => useProjectChat(projectId));

    await act(() => projectChat.loadHistory(projectId));

    expect(api.resumeChat).not.toHaveBeenCalled();
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages).toHaveLength(2);
  });

  it("falls back to the saved turn when the answer finished just before reattaching", async () => {
    vi.mocked(api.getActiveGeneration).mockResolvedValueOnce(active).mockResolvedValue(null);
    vi.mocked(api.getChatHistory).mockResolvedValueOnce([] as never);
    const { result } = renderHook(() => useProjectChat(projectId));
    await act(() => projectChat.loadHistory(projectId));
    serverSaved([savedEvent(ChatEventType.MESSAGE, "Done")], "ANSWERED");

    await act(async () => lastResume().onGone?.());
    await flush();

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(result.current.messages[1].events).toHaveLength(2);
  });
});

describe("keeping a message whose request never got through", () => {
  const quotaError = () => new ApiRequestError("You've used today's AI allowance on the Free plan.", 402);

  const reloadPage = async () => {
    const freshId = projectId;
    const { result } = renderHook(() => useProjectChat(freshId));
    await act(() => projectChat.loadHistory(freshId));
    return result;
  };

  it("brings back a refused message after a refresh, with its error and Retry ready", async () => {
    const stream = startResponse(projectId);
    act(() => stream.onError(quotaError()));

    const reloaded = `reload-${Math.random()}`;
    localStorage.setItem(`failed_prompt_7_${reloaded}`, localStorage.getItem(`failed_prompt_7_${projectId}`)!);
    projectId = reloaded;
    const result = await reloadPage();

    const [question, answer] = result.current.messages;
    expect(question).toMatchObject({ role: "user", content: PROMPT });
    expect(answer).toMatchObject({ role: "assistant", notSent: true });
    expect(answer.error).toContain("AI allowance");
    expect(result.current.lastSentMessage).toBe(PROMPT);

    captureStreams();
    act(() => projectChat.retryLastMessage(projectId));
    expect(vi.mocked(api.streamChat).mock.calls[0][1]).toBe(PROMPT);
    expect(localStorage.getItem(`failed_prompt_7_${projectId}`)).toBeNull();
  });

  it("forgets it once a response to it succeeds", () => {
    const stream = startResponse(projectId);
    act(() => stream.onError(quotaError()));
    expect(localStorage.getItem(`failed_prompt_7_${projectId}`)).not.toBeNull();

    captureStreams();
    act(() => projectChat.retryLastMessage(projectId));
    act(() => lastStream().onDone("ANSWERED"));

    expect(localStorage.getItem(`failed_prompt_7_${projectId}`)).toBeNull();
  });

  it("does not bring it back once the server has the turn, since a failed turn is saved there now", async () => {
    const stream = startResponse(projectId);
    act(() => stream.onError(new Error("Can't reach the Singularity server.")));
    expect(localStorage.getItem(`failed_prompt_7_${projectId}`)).not.toBeNull();
    vi.mocked(api.getChatHistory).mockResolvedValue([
      { id: 1, role: "USER", content: PROMPT, createdAt: new Date().toISOString(), events: [] },
      { id: 2, role: "ASSISTANT", content: "", createdAt: new Date().toISOString(), events: [
        savedEvent(ChatEventType.THOUGHT, "Worked for 2s", { metadata: "FAILED" }),
        savedEvent(ChatEventType.MESSAGE, "Something went wrong while generating this response."),
      ] },
    ] as never);

    const reloaded = `reload-${Math.random()}`;
    localStorage.setItem(`failed_prompt_7_${reloaded}`, localStorage.getItem(`failed_prompt_7_${projectId}`)!);
    projectId = reloaded;
    const result = await reloadPage();

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].outcome).toBe("FAILED");
    expect(localStorage.getItem(`failed_prompt_7_${projectId}`)).toBeNull();
  });
});

describe("diff baselines", () => {
  const rewriteFile = async (path: string, before: string, after: string) => {
    vi.mocked(api.getFileContent).mockResolvedValue(before);
    const stream = startResponse(projectId);
    await act(async () => stream.onChunk(`<file path="${path}">${after.slice(0, 5)}`));
    await act(async () => stream.onChunk(`${after.slice(5)}</file>`));
    serverSaved([savedEvent(ChatEventType.FILE_EDIT, `${after}\n`, { filePath: path })]);
    await act(async () => stream.onDone("SAVED"));
    await flush();
  };

  it("keeps the last turn's diff after a reload, since the server has no copy of the old version", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    await rewriteFile("src/App.tsx", "const before = 1;", "const after = 2;");

    expect(result.current.diffBaselines.get("src/App.tsx")).toBe("const before = 1;");

    vi.resetModules();
    const reloaded = await import("./project-chat-store");
    const afterReload = renderHook(() => reloaded.useProjectChat(projectId));

    expect(afterReload.result.current.messages).toEqual([]);
    expect(afterReload.result.current.diffBaselines.get("src/App.tsx")).toBe("const before = 1;");
    expect(afterReload.result.current.lastTurnFiles).toEqual(["src/App.tsx"]);
  });

  it("will not drop the diff of a file the latest turn wrote", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    await rewriteFile("src/App.tsx", "const before = 1;", "const after = 2;");

    act(() => projectChat.markDiffViewed(projectId, "src/App.tsx"));

    expect(result.current.diffBaselines.get("src/App.tsx")).toBe("const before = 1;");
  });

  it("drops the diff of a file the server did not save after all", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    vi.mocked(api.getFileContent).mockResolvedValue("const before = 1;");
    const stream = startResponse(projectId);
    await act(async () => stream.onChunk('<file path="src/Lost.tsx">const after = 2;</file>'));
    expect(result.current.diffBaselines.has("src/Lost.tsx")).toBe(true);
    serverSaved([savedEvent(ChatEventType.MESSAGE, "Couldn't save this file: src/Lost.tsx. Please try again.")], "NOT_SAVED");

    await act(async () => stream.onDone("NOT_SAVED"));
    await flush();

    expect(result.current.diffBaselines.has("src/Lost.tsx")).toBe(false);
    expect(result.current.lastTurnFiles).toEqual([]);
  });

  it("starts the next turn with no diffs, and clears the stored copy too", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    await rewriteFile("src/App.tsx", "const before = 1;", "const after = 2;");

    startResponse(projectId);

    expect(result.current.diffBaselines.size).toBe(0);
    expect(sessionStorage.getItem(`diff_baselines_${projectId}`)).toBeNull();
  });
});

describe("teaching mode, turn by turn", () => {
  it("marks only the reply to a message sent with the mode on, and sends each message the way it was asked", () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    captureStreams();

    act(() => { projectChat.sendMessage(projectId, "plain build"); });
    act(() => projectChat.stopStreaming(projectId));
    act(() => { projectChat.sendMessage(projectId, "teach me this one", true); });

    expect(result.current.messages.map((message) => !!message.teaching)).toEqual([false, false, false, true]);
    expect(vi.mocked(api.streamChat).mock.calls.map((call) => call[3])).toEqual([false, true]);
  });

  it("keeps the mark when the saved turn replaces the live one, and reads it back from a saved conversation", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    captureStreams();
    act(() => { projectChat.sendMessage(projectId, PROMPT, true); });
    const saved = savedTurn([savedEvent(ChatEventType.FILE_EDIT, "export default 1;\n", { id: 9, filePath: "src/App.tsx" })]);
    vi.mocked(api.getChatHistory).mockResolvedValue([saved[0], { ...saved[1], teaching: true }] as never);

    act(() => lastStream().onDone("SAVED"));
    await flush();

    expect(result.current.messages[1].teaching).toBe(true);
    expect(result.current.messages[1].events?.[1].id).toBe(9);

    const other = `project-${Math.random()}`;
    const reloaded = renderHook(() => useProjectChat(other));
    await act(async () => { await projectChat.loadHistory(other); });
    expect(reloaded.result.current.messages.map((message) => !!message.teaching)).toEqual([false, true]);
  });

  it("retries a turn the way it was first asked", () => {
    renderHook(() => useProjectChat(projectId));
    captureStreams();
    act(() => { projectChat.sendMessage(projectId, PROMPT, true); });
    act(() => projectChat.stopStreaming(projectId));

    act(() => projectChat.retryLastMessage(projectId));

    expect(vi.mocked(api.streamChat).mock.calls.map((call) => call[3])).toEqual([true, true]);
  });
});

describe("a request whose stream failed to open", () => {
  it("joins the turn when the server started it anyway, and shows no failure", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    vi.mocked(api.getActiveGeneration).mockResolvedValue({ userMessage: PROMPT, startedAt: new Date().toISOString(), status: "RUNNING" });

    await act(async () => stream.onError(new ApiRequestError("Something went wrong on our side.", 500)));

    expect(resumes).toHaveLength(1);
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].error).toBeUndefined();
  });

  it("is a failure worth retrying when the server has no such turn", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    vi.mocked(api.getActiveGeneration).mockResolvedValue(null);

    await act(async () => stream.onError(new ApiRequestError("Something went wrong on our side.", 500)));

    expect(resumes).toHaveLength(0);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages[1].error).toBe("Something went wrong on our side.");
  });

  it("does not join someone's turn for a different request", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    vi.mocked(api.getActiveGeneration).mockResolvedValue({ userMessage: "another request", startedAt: new Date().toISOString(), status: "RUNNING" });

    await act(async () => stream.onError(new ApiRequestError("Something went wrong on our side.", 500)));

    expect(resumes).toHaveLength(0);
    expect(result.current.messages[1].error).toBeDefined();
  });
});
