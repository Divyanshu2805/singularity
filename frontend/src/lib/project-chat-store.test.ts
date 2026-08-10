/**
 * Covers the chat store's handling of files while a response streams: a half-written file's content kept so it never
 * has to be fetched mid-response, content available the moment a tag opens, a finished file moving from streaming to
 * completed, and a file whose tag never closed being dropped when the response ends or fails - falling back to the
 * server, which did not save it either.
 *
 * Also covers that lessons are only asked for when the message was sent with teaching mode on, and that server
 * history replaces the live copy only once it has really caught up.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("./api", () => ({
  ApiRequestError: class ApiRequestError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  },
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

import { api, ApiRequestError } from "./api";
import { projectChat, useProjectChat } from "./project-chat-store";

type StreamCallbacks = {
  chunk: (text: string) => void;
  onFile: (path: string, content: string, isComplete: boolean) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
};

const streams: StreamCallbacks[] = [];
let abortedStreams = 0;

const lastStream = () => streams[streams.length - 1];

function captureStreams() {
  streams.length = 0;
  abortedStreams = 0;
  vi.mocked(api.streamChat).mockImplementation(((_p, _m, onChunk, onFile, onComplete, onError) => {
    streams.push({ chunk: onChunk, onFile, onComplete, onError });
    return () => { abortedStreams += 1; };
  }) as typeof api.streamChat);
}

function startResponse(projectId: string): StreamCallbacks {
  captureStreams();
  act(() => projectChat.sendMessage(projectId, "build me a todo app"));
  return lastStream();
}

const resolve = (state: { completedFiles: ReadonlyMap<string, string>; streamingFiles: ReadonlyMap<string, string> }, path: string) =>
  state.completedFiles.get(path) ?? state.streamingFiles.get(path);

describe("projectChatStore file content during a response", () => {
  let projectId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getFileContent).mockResolvedValue("");
    projectId = `project-${Math.random()}`;
  });

  it("keeps a half-written file's content, so it never has to be fetched mid-response", () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);

    act(() => stream.onFile("src/components/TodoItem.tsx", "export function TodoItem(", false));
    expect(resolve(result.current, "src/components/TodoItem.tsx")).toBe("export function TodoItem(");

    act(() => stream.onFile("src/components/TodoItem.tsx", "export function TodoItem() {\n  return null;", false));
    expect(resolve(result.current, "src/components/TodoItem.tsx")).toBe("export function TodoItem() {\n  return null;");
    expect(result.current.streamingFilePath).toBe("src/components/TodoItem.tsx");
  });

  it("has content for a file the moment its tag opens, before any body has arrived", () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);

    act(() => stream.onFile("src/components/TodoList.tsx", "", false));
    expect(resolve(result.current, "src/components/TodoList.tsx")).toBe("");
  });

  it("moves a finished file out of streaming and into completed", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);

    act(() => stream.onFile("src/App.tsx", "partial", false));
    await act(async () => stream.onFile("src/App.tsx", "export default App;", true));

    expect(result.current.streamingFiles.has("src/App.tsx")).toBe(false);
    expect(result.current.completedFiles.get("src/App.tsx")).toBe("export default App;");
    expect(resolve(result.current, "src/App.tsx")).toBe("export default App;");
    expect(result.current.streamingFilePath).toBeNull();
    expect(result.current.lastTurnFiles).toEqual(["src/App.tsx"]);
  });

  it("drops a file whose tag never closed when the response ends, falling back to the server", () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);

    act(() => stream.onFile("src/Abandoned.tsx", "half a file", false));
    act(() => stream.onComplete());

    expect(resolve(result.current, "src/Abandoned.tsx")).toBeUndefined();
    expect(result.current.isStreaming).toBe(false);
  });

  it("drops a half-written file when the response fails", () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);

    act(() => stream.onFile("src/Broken.tsx", "half a file", false));
    act(() => stream.onError(new Error("rate limited")));

    expect(resolve(result.current, "src/Broken.tsx")).toBeUndefined();
    expect(result.current.isStreaming).toBe(false);
  });

  it("asks for lessons only when the message was sent with teaching mode on", () => {
    vi.mocked(api.streamChat).mockImplementation((() => () => {}) as typeof api.streamChat);

    act(() => projectChat.sendMessage(projectId, "build me a timer", { teachingMode: true }));
    expect(vi.mocked(api.streamChat).mock.calls[0][6]).toEqual({ teachingMode: true });

    act(() => vi.mocked(api.streamChat).mock.calls[0][4]());
    act(() => projectChat.sendMessage(projectId, "now make it blue"));
    expect(vi.mocked(api.streamChat).mock.calls[1][6]).toEqual({ teachingMode: false });
  });

  it("clears the previous response's half-written files when a new one starts", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const first = startResponse(projectId);

    act(() => first.onFile("src/Stale.tsx", "half a file", false));
    await act(async () => first.onFile("src/Done.tsx", "finished", true));
    act(() => first.onComplete());

    startResponse(projectId);
    expect(result.current.streamingFiles.size).toBe(0);
    expect(result.current.completedFiles.get("src/Done.tsx")).toBe("finished");
  });
});

describe("projectChatStore keeping a finished turn", () => {
  const savedTurn = (events: unknown[]) => [
    { id: 1, role: "USER", content: "build me a todo app", createdAt: "2026-09-16T10:00:00Z", events: [] },
    { id: 2, role: "ASSISTANT", content: "Assistant Message here...", createdAt: "2026-09-16T10:00:20Z", events },
  ];

  let projectId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getFileContent).mockResolvedValue("");
    projectId = `project-${Math.random()}`;
  });

  it("stamps a time on both messages and measures how long the answer took", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T10:00:00Z"));
    try {
      const { result } = renderHook(() => useProjectChat(projectId));
      const stream = startResponse(projectId);

      expect(result.current.messages[0].createdAt).toBe("2026-09-16T10:00:00.000Z");

      vi.setSystemTime(new Date("2026-09-16T10:00:07Z"));
      act(() => stream.onComplete());

      const answer = result.current.messages[1];
      expect(answer.thoughtSeconds).toBe(7);
      expect(answer.createdAt).toBe("2026-09-16T10:00:07.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not replace a just-finished answer with a saved copy whose events are missing", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    act(() => stream.onComplete());

    vi.mocked(api.getChatHistory).mockResolvedValue(savedTurn([]) as never);
    await act(() => projectChat.loadHistory(projectId));

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].content).not.toBe("Assistant Message here...");
    expect(result.current.hasUnsavedTurn).toBe(true);
  });

  it("takes the saved copy once its events are really there", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    act(() => stream.onComplete());

    vi.mocked(api.getChatHistory).mockResolvedValue(savedTurn([{ type: "MESSAGE", content: "Done." }]) as never);
    await act(() => projectChat.loadHistory(projectId));

    expect(result.current.messages[1].events).toHaveLength(1);
    expect(result.current.hasUnsavedTurn).toBe(false);
  });
});

describe("projectChatStore diff baselines", () => {
  let projectId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    projectId = `project-${Math.random()}`;
  });

  const rewriteFile = async (path: string, before: string, after: string) => {
    vi.mocked(api.getFileContent).mockResolvedValue(before);
    const stream = startResponse(projectId);
    await act(async () => {
      stream.onFile(path, after.slice(0, 5), false);
      stream.onFile(path, after, true);
    });
    act(() => stream.onComplete());
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

  it("still drops the diff of a file the latest turn did not write", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    await rewriteFile("src/App.tsx", "const before = 1;", "const after = 2;");

    act(() => projectChat.markDiffViewed(projectId, "src/Other.tsx"));
    expect(result.current.diffBaselines.has("src/Other.tsx")).toBe(false);
  });

  it("starts the next turn with no diffs, and clears the stored copy too", async () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    await rewriteFile("src/App.tsx", "const before = 1;", "const after = 2;");

    startResponse(projectId);

    expect(result.current.diffBaselines.size).toBe(0);
    expect(sessionStorage.getItem(`diff_baselines_${projectId}`)).toBeNull();
  });
});

describe("projectChatStore stopping and retrying", () => {
  let projectId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.mocked(api.getFileContent).mockResolvedValue("");
    projectId = `project-${Math.random()}`;
  });

  const cutShortResponse = (stream: ReturnType<typeof startResponse>) => {
    act(() => {
      stream.chunk('<todo path="src/a.tsx">One</todo><todo path="src/b.tsx">Two</todo><todo path="src/c.tsx">Three</todo>');
      stream.onFile("src/a.tsx", "const a = 1;", true);
    });
  };

  it("marks how many planned steps never arrived, since a cut-off answer ends without an error", () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    cutShortResponse(stream);
    act(() => stream.onComplete());

    expect(result.current.messages[1].unfinishedSteps).toBe(2);
  });

  it("has one automatic go at finishing, and does not turn that into a chain", () => {
    renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    cutShortResponse(stream);
    act(() => stream.onComplete());

    expect(vi.mocked(api.streamChat)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.streamChat).mock.calls[1][1]).toBe("build me a todo app");

    const retryStream = lastStream();
    act(() => {
      retryStream.chunk('<todo path="src/b.tsx">Two</todo>');
      retryStream.onComplete();
    });
    expect(vi.mocked(api.streamChat)).toHaveBeenCalledTimes(2);
  });

  it("does not retry an answer that finished everything it planned", async () => {
    renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);
    await act(async () => {
      stream.chunk('<todo path="src/a.tsx">One</todo>');
      stream.onFile("src/a.tsx", "const a = 1;", true);
    });
    act(() => stream.onComplete());

    expect(vi.mocked(api.streamChat)).toHaveBeenCalledTimes(1);
  });

  it("stops the response in flight and says the answer was stopped", () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    startResponse(projectId);

    act(() => projectChat.stopStreaming(projectId));

    expect(abortedStreams).toBe(1);
    expect(vi.mocked(api.stopGeneration)).toHaveBeenCalledWith(projectId);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages[1].wasStopped).toBe(true);
    expect(vi.mocked(api.streamChat)).toHaveBeenCalledTimes(1);
  });

  it("sends the same message again on an explicit retry", () => {
    renderHook(() => useProjectChat(projectId));
    startResponse(projectId);
    act(() => projectChat.stopStreaming(projectId));

    act(() => projectChat.retryLastMessage(projectId));

    expect(vi.mocked(api.streamChat)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.streamChat).mock.calls[1][1]).toBe("build me a todo app");
  });

  it("drops a retry the server rejected as a conflict, instead of leaving it stuck with a stale error", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useProjectChat(projectId));
      const original = startResponse(projectId);
      act(() => {
        original.chunk("<message>Done.</message>");
        original.onComplete();
      });
      expect(result.current.messages).toHaveLength(2);

      act(() => projectChat.retryLastMessage(projectId));
      expect(result.current.messages).toHaveLength(4);

      const retry = lastStream();
      act(() => retry.onError(new ApiRequestError("A response is already being generated for this project.", 409)));

      // The doomed retry's optimistic pair is gone - the original turn is all that is left.
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1].content).toContain("Done.");

      vi.mocked(api.getChatHistory).mockResolvedValueOnce([]);
      await act(async () => {
        vi.advanceTimersByTime(1500);
        await Promise.resolve();
      });
      expect(vi.mocked(api.getChatHistory)).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("projectChatStore after a refresh mid-response", () => {
  let projectId: string;
  const active = {
    userMessage: "build me a todo app",
    startedAt: new Date(Date.now() - 20_000).toISOString(),
    teachingMode: false,
    status: "RUNNING" as const,
  };
  type ResumeCallbacks = { onChunk: (text: string) => void; onFile: (path: string, content: string, isComplete: boolean) => void; onComplete: () => void; onGone: () => void };
  let resumed: ResumeCallbacks | null;

  beforeEach(() => {
    vi.clearAllMocks();
    projectId = `refresh-${Math.random()}`;
    resumed = null;
    vi.mocked(api.getFileContent).mockResolvedValue("");
    vi.mocked(api.resumeChat).mockImplementation(((_p, onChunk, onFile, onComplete, _onError, onGone) => {
      resumed = { onChunk, onFile, onComplete, onGone };
      return () => undefined;
    }) as typeof api.resumeChat);
  });

  it("puts the question back and follows the answer from where the server has got to", async () => {
    const saved = [{ id: 1, role: "USER", content: "earlier question", createdAt: new Date(Date.now() - 600_000).toISOString(), events: [] }];
    vi.mocked(api.getChatHistory).mockResolvedValue(saved as never);
    vi.mocked(api.getActiveGeneration).mockResolvedValue(active);
    const { result } = renderHook(() => useProjectChat(projectId));

    await act(() => projectChat.loadHistory(projectId));

    expect(api.resumeChat).toHaveBeenCalledTimes(1);
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "earlier question"],
      ["user", "build me a todo app"],
      ["assistant", ""],
    ]);

    act(() => {
      resumed!.onChunk('<message>On it</message><file path="src/App.tsx">done</file>');
      resumed!.onFile("src/App.tsx", "done", true);
    });
    expect(result.current.messages[2].content).toContain("On it");
    expect(result.current.messages[2].instantLength).toBe(result.current.messages[2].content.length);
    act(() => resumed!.onChunk("<message>more</message>"));
    expect(result.current.messages[2].instantLength).toBeLessThan(result.current.messages[2].content.length);
    expect(result.current.completedFiles.get("src/App.tsx")).toBe("done");

    act(() => resumed!.onComplete());
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.hasUnsavedTurn).toBe(true);
  });

  it("does not show a turn twice when it finished saving between the check and the history read", async () => {
    vi.mocked(api.getActiveGeneration).mockResolvedValue(active);
    vi.mocked(api.getChatHistory).mockResolvedValue([
      { id: 1, role: "USER", content: active.userMessage, createdAt: new Date().toISOString(), events: [] },
      { id: 2, role: "ASSISTANT", content: "Assistant Message here...", createdAt: new Date().toISOString(), events: [{ id: 1, type: "MESSAGE", content: "Done" }] },
    ] as never);
    const { result } = renderHook(() => useProjectChat(projectId));

    await act(() => projectChat.loadHistory(projectId));

    expect(api.resumeChat).not.toHaveBeenCalled();
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages).toHaveLength(2);
  });

  it("falls back to the saved history when the answer finished just before reattaching", async () => {
    vi.mocked(api.getActiveGeneration).mockResolvedValueOnce(active).mockResolvedValueOnce(null);
    vi.mocked(api.getChatHistory).mockResolvedValueOnce([] as never).mockResolvedValueOnce([
      { id: 1, role: "USER", content: active.userMessage, createdAt: new Date().toISOString(), events: [] },
      { id: 2, role: "ASSISTANT", content: "", createdAt: new Date().toISOString(), events: [{ id: 1, type: "MESSAGE", content: "Done" }] },
    ] as never);
    const { result } = renderHook(() => useProjectChat(projectId));
    await act(() => projectChat.loadHistory(projectId));

    await act(async () => {
      resumed!.onGone();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(result.current.messages[1].events).toHaveLength(1);
  });
});

describe("projectChatStore keeping a message whose response failed", () => {
  let projectId: string;
  const quotaError = () => new ApiRequestError("You've used today's AI allowance on the Free plan.", 402);

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    projectId = `failed-${Math.random()}`;
    vi.mocked(api.getActiveGeneration).mockResolvedValue(null);
    vi.mocked(api.getChatHistory).mockResolvedValue([]);
  });

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
    expect(question).toMatchObject({ role: "user", content: "build me a todo app" });
    expect(answer).toMatchObject({ role: "assistant", notSent: true });
    expect(answer.error).toContain("AI allowance");
    expect(result.current.lastSentMessage).toBe("build me a todo app");

    captureStreams();
    act(() => projectChat.retryLastMessage(projectId));
    expect(vi.mocked(api.streamChat).mock.calls[0][1]).toBe("build me a todo app");
    expect(localStorage.getItem(`failed_prompt_7_${projectId}`)).toBeNull();
  });

  it("forgets it once a response to it succeeds", () => {
    const stream = startResponse(projectId);
    act(() => stream.onError(quotaError()));
    expect(localStorage.getItem(`failed_prompt_7_${projectId}`)).not.toBeNull();

    captureStreams();
    act(() => projectChat.retryLastMessage(projectId));
    act(() => lastStream().onComplete());

    expect(localStorage.getItem(`failed_prompt_7_${projectId}`)).toBeNull();
  });

  it("does not show it twice when the server did save that turn after all", async () => {
    localStorage.setItem(`failed_prompt_7_${projectId}`, JSON.stringify({
      content: "build me a todo app", error: "network", failedAt: Date.now() - 1000, teachingMode: false, notSent: false,
    }));
    vi.mocked(api.getChatHistory).mockResolvedValue([
      { id: 1, role: "USER", content: "build me a todo app", createdAt: new Date().toISOString(), events: [] },
      { id: 2, role: "ASSISTANT", content: "", createdAt: new Date().toISOString(), events: [{ id: 1, type: "MESSAGE", content: "Done" }] },
    ] as never);

    const result = await reloadPage();

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].error).toBeUndefined();
    expect(localStorage.getItem(`failed_prompt_7_${projectId}`)).toBeNull();
  });

  it("forgets a message the reader deliberately stopped", () => {
    startResponse(projectId);
    act(() => projectChat.stopStreaming(projectId));
    expect(localStorage.getItem(`failed_prompt_7_${projectId}`)).toBeNull();
  });
});

describe("projectChatStore when the AI deletes a file", () => {
  let projectId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    projectId = `delete-${Math.random()}`;
    vi.mocked(api.getFileContent).mockResolvedValue("");
  });

  it("marks the old copy deleted as soon as its delete tag arrives, and forgets it if written again", () => {
    const { result } = renderHook(() => useProjectChat(projectId));
    const stream = startResponse(projectId);

    act(() => {
      stream.chunk('<file path="src/New.tsx">new</file>');
      stream.onFile("src/New.tsx", "new", true);
      stream.chunk('<delete path="src/Old.tsx">Renamed to New.tsx</delete>');
    });
    expect([...result.current.deletedFiles]).toEqual(["src/Old.tsx"]);
    expect(result.current.completedFiles.has("src/New.tsx")).toBe(true);

    act(() => stream.onComplete());
    captureStreams();
    act(() => projectChat.sendMessage(projectId, "bring the old page back"));
    act(() => lastStream().onFile("src/Old.tsx", "restored", true));
    expect(result.current.deletedFiles.has("src/Old.tsx")).toBe(false);
  });
});

describe("projectChatStore restoring the last turn's diffs", () => {
  let projectId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    projectId = `diffs-${Math.random()}`;
    vi.mocked(api.getActiveGeneration).mockResolvedValue(null);
    vi.mocked(api.getChatHistory).mockResolvedValue([]);
  });

  it("rebuilds them from the server after signing back in, when the browser has none", async () => {
    vi.mocked(api.getLastTurnChanges).mockResolvedValue({
      files: [
        { path: "src/App.tsx", previousContent: "old app" },
        { path: "src/New.tsx", previousContent: "" },
      ],
    });
    const { result } = renderHook(() => useProjectChat(projectId));

    await act(async () => {
      await projectChat.loadHistory(projectId);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.diffBaselines.get("src/App.tsx")).toBe("old app");
    expect(result.current.diffBaselines.get("src/New.tsx")).toBe("");
    expect(result.current.lastTurnFiles).toEqual(["src/App.tsx", "src/New.tsx"]);
  });

  it("keeps the browser's own copy, which may be newer than what the server has saved", async () => {
    sessionStorage.setItem(`diff_baselines_${projectId}`, JSON.stringify({ baselines: [["src/Local.tsx", "local"]], lastTurnFiles: ["src/Local.tsx"] }));
    vi.mocked(api.getLastTurnChanges).mockResolvedValue({ files: [{ path: "src/App.tsx", previousContent: "server" }] });
    const { result } = renderHook(() => useProjectChat(projectId));

    await act(async () => {
      await projectChat.loadHistory(projectId);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect([...result.current.diffBaselines.keys()]).toEqual(["src/Local.tsx"]);
  });
});
