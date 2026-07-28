/**
 * Covers the code-lens thread: no thread until a selection opens one, the answer building up as it arrives, a stream
 * that produces nothing dropping its placeholder, every turn stamped with a time, and earlier turns surviving a new
 * selection so the thread is the project's history.
 *
 * Also covers the selection rules - the snippet attaches to the turn that introduced it and not to follow-ups about
 * the same block - and that a failed or partial stream keeps what arrived rather than losing the conversation around
 * it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("./api", () => ({
  api: {
    streamCodeInsight: vi.fn(),
    getCodeNotes: vi.fn(),
    saveCodeNote: vi.fn(),
    deleteCodeNote: vi.fn(),
    clearCodeNotes: vi.fn(),
  },
  getUserInfo: vi.fn(() => ({ id: 7, username: "divyanshu", name: "Divyanshu" })),
}));

import { api } from "./api";
import { codeLens, forgetLoadedThreadsForTests, useCodeLens } from "./code-lens-store";
import { clearSignedInState } from "./session";
import type { CodeSelection } from "./types";

const selection: CodeSelection = {
  path: "src/Counter.tsx",
  code: "const [count, setCount] = useState(0);",
  startLine: 4,
  endLine: 4,
};

const otherSelection: CodeSelection = {
  path: "src/App.tsx",
  code: "<Route path='*' element={<NotFound />} />",
  startLine: 9,
  endLine: 12,
};

type Stream = {
  kind: "explain" | "ask";
  body: Record<string, unknown>;
  chunk: (text: string) => void;
  done: () => void;
  fail: (error: Error) => void;
};

function lastStream(): Stream {
  const calls = vi.mocked(api.streamCodeInsight).mock.calls;
  const [, kind, body, onChunk, onComplete, onError] = calls[calls.length - 1] as never as [
    string, "explain" | "ask", Record<string, unknown>,
    (t: string) => void, () => void, (e: Error) => void
  ];
  return { kind, body, chunk: onChunk, done: onComplete, fail: onError };
}

function answer(text: string) {
  const stream = lastStream();
  act(() => stream.chunk(text));
  act(() => stream.done());
}

const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

let savedNoteId = 0;

describe("codeLens thread", () => {
  let projectId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.mocked(api.streamCodeInsight).mockImplementation((() => () => {}) as typeof api.streamCodeInsight);
    vi.mocked(api.getCodeNotes).mockResolvedValue([]);
    vi.mocked(api.saveCodeNote).mockImplementation(async (_projectId, note) => ({ id: ++savedNoteId, ...note }));
    vi.mocked(api.deleteCodeNote).mockResolvedValue(undefined);
    vi.mocked(api.clearCodeNotes).mockResolvedValue(undefined);
    projectId = `project-${Math.random()}`;
  });

  it("has no thread until a selection opens one", () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    expect(result.current).toBeNull();

    act(() => codeLens.open(projectId, selection, { explain: false }));
    expect(result.current?.isOpen).toBe(true);
    expect(result.current?.selection).toEqual(selection);
  });

  it("builds the answer up as it arrives rather than showing it all at once", () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: true }));

    const stream = lastStream();
    expect(stream.kind).toBe("explain");

    expect(result.current?.turns.at(-1)).toMatchObject({ role: "assistant", content: "", isStreaming: true });

    act(() => stream.chunk("It stores "));
    expect(result.current?.turns.at(-1)?.content).toBe("It stores ");
    act(() => stream.chunk("the count."));
    expect(result.current?.turns.at(-1)?.content).toBe("It stores the count.");
    expect(result.current?.isBusy).toBe(true);

    act(() => stream.done());
    expect(result.current?.turns.at(-1)).toMatchObject({ content: "It stores the count.", isStreaming: false });
    expect(result.current?.isBusy).toBe(false);
  });

  it("drops the placeholder when a stream ends without producing anything", () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: true }));

    act(() => lastStream().done());

    expect(result.current?.turns.map((t) => t.role)).toEqual(["user"]);
  });

  it("stamps every turn with a time", () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: true }));
    answer("It stores the count.");

    for (const turn of result.current!.turns) {
      expect(turn.at).toBeTruthy();
      expect(Number.isNaN(new Date(turn.at!).getTime())).toBe(false);
    }
  });

  it("keeps earlier turns when a different block is selected, so the thread is the project's history", () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: true }));
    answer("It stores the count.");
    expect(result.current?.turns).toHaveLength(2);

    act(() => codeLens.open(projectId, otherSelection, { explain: true }));
    answer("That's the catch-all route.");

    expect(result.current?.turns).toHaveLength(4);
    expect(result.current?.turns.map((turn) => turn.selection)).toEqual([
      selection, undefined, otherSelection, undefined,
    ]);
    expect(result.current?.selection).toBeNull();
  });

  it("attaches the snippet to the turn that introduced it, and not to follow-ups about the same block", () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: true }));
    answer("It stores the count.");
    act(() => codeLens.ask(projectId, "What does the 0 do?"));
    answer("The starting value.");

    const quoted = result.current!.turns.filter((turn) => turn.selection);
    expect(quoted).toHaveLength(1);
    expect(quoted[0].content).toBe("Explain this");
  });

  it("stops asking about a block once the question has been sent", () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: false }));
    expect(result.current?.selection).toEqual(selection);

    act(() => codeLens.ask(projectId, "What does this do?"));

    expect(lastStream().body).toMatchObject({ code: selection.code, path: selection.path });
    expect(result.current?.turns[0].selection).toEqual(selection);
    expect(result.current?.selection).toBeNull();
  });

  it("sends the next question without the block that the last one was about", () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: false }));
    act(() => codeLens.ask(projectId, "What does this do?"));
    answer("It stores the count.");

    act(() => codeLens.ask(projectId, "And how would I test it?"));

    expect(lastStream().body).toEqual({
      question: "And how would I test it?",
      history: [
        { role: "user", content: "What does this do?" },
        { role: "assistant", content: "It stores the count." },
      ],
    });
    expect(result.current?.selection).toBeNull();
  });

  it("stops asking about a block after Explain too", () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: true }));

    expect(lastStream().body).toMatchObject({ code: selection.code });
    expect(result.current?.turns[0].selection).toEqual(selection);
    expect(result.current?.selection).toBeNull();
  });

  it("attaches the new snippet once the selection moves to a different block", () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: true }));
    answer("It stores the count.");

    act(() => codeLens.open(projectId, otherSelection, { explain: false }));
    act(() => codeLens.ask(projectId, "And this one?"));

    const quoted = result.current!.turns.filter((turn) => turn.selection);
    expect(quoted.map((turn) => turn.selection)).toEqual([selection, otherSelection]);
  });

  it("closing keeps the conversation so reopening continues it", () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: false }));
    act(() => codeLens.close(projectId));
    expect(result.current?.isOpen).toBe(false);

    act(() => codeLens.reopen(projectId));
    expect(result.current?.isOpen).toBe(true);
    expect(result.current?.selection).toEqual(selection);
  });

  it("keeps the transcript, but not a spent selection, across a close and reopen", () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: true }));
    answer("It stores the count.");

    act(() => codeLens.close(projectId));
    act(() => codeLens.reopen(projectId));

    expect(result.current?.turns).toHaveLength(2);
    expect(result.current?.selection).toBeNull();
  });

  it("clears the conversation only when explicitly asked, on the server as well as here", async () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: true }));
    answer("It stores the count.");
    await flush();

    act(() => codeLens.clear(projectId));
    expect(result.current?.turns).toEqual([]);
    expect(result.current?.isOpen).toBe(true);
    expect(api.clearCodeNotes).toHaveBeenCalledWith(projectId);
  });

  it("shows the question straight away and sends only what came before it as history", () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: true }));
    answer("It stores the count across renders.");

    act(() => codeLens.ask(projectId, "What does the 0 do?"));

    const stream = lastStream();
    expect(stream.kind).toBe("ask");
    expect(stream.body.question).toBe("What does the 0 do?");
    expect(stream.body.history).toEqual([
      { role: "user", content: "Explain this" },
      { role: "assistant", content: "It stores the count across renders." },
    ]);
    expect(result.current?.turns.map((turn) => turn.role)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  it("surfaces a failure without losing the conversation around it", () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: true }));
    answer("It stores the count.");

    act(() => codeLens.ask(projectId, "Why?"));
    act(() => lastStream().fail(new Error("Rate limited")));

    expect(result.current?.error).toBe("Rate limited");
    expect(result.current?.isBusy).toBe(false);
    expect(result.current?.turns.map((t) => t.role)).toEqual(["user", "assistant", "user"]);

    act(() => codeLens.dismissError(projectId));
    expect(result.current?.error).toBeNull();
    expect(result.current?.turns).toHaveLength(3);
  });

  it("keeps a partial answer when the stream fails midway", () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: true }));

    const stream = lastStream();
    act(() => stream.chunk("It stores the co"));
    act(() => stream.fail(new Error("Connection lost")));

    expect(result.current?.turns.at(-1)?.content).toBe("It stores the co");
    expect(result.current?.error).toBe("Connection lost");
  });

  it("ignores a blank question", () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: false }));

    act(() => codeLens.ask(projectId, "   "));

    expect(api.streamCodeInsight).not.toHaveBeenCalled();
    expect(result.current?.turns).toEqual([]);
  });

  it("answers a question about the project with nothing selected", () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.reopen(projectId));

    act(() => codeLens.ask(projectId, "Where is routing set up?"));

    const stream = lastStream();
    expect(stream.kind).toBe("ask");
    expect(stream.body).toEqual({ question: "Where is routing set up?", history: [] });
    expect(result.current?.turns.at(-2)).toMatchObject({ role: "user", content: "Where is routing set up?" });
    expect(result.current?.turns.at(-2)?.selection).toBeUndefined();
  });

  it("can drop the selection so the next question is about the whole project", () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: false }));

    act(() => codeLens.clearSelection(projectId));
    expect(result.current?.selection).toBeNull();

    act(() => codeLens.ask(projectId, "What does this app do?"));
    expect(lastStream().body).not.toHaveProperty("code");
  });

  it("trims replayed history to what the backend accepts", () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.reopen(projectId));
    act(() => codeLens.ask(projectId, "Tell me everything"));
    answer("x".repeat(5000));
    expect(result.current?.turns).toHaveLength(2);

    act(() => codeLens.ask(projectId, "And?"));
    const history = lastStream().body.history as { content: string }[];
    expect(history[1].content).toHaveLength(4000);
  });

  it("loads the saved thread from the server when the panel opens", async () => {
    vi.mocked(api.getCodeNotes).mockResolvedValue([
      { id: 11, question: "Explain this", answer: "It stores the count.", selection, createdAt: "2026-09-16T04:00:00Z" },
      { id: 12, question: "What does the 0 do?", answer: "The starting value.", selection: null },
    ]);

    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.reopen(projectId));
    expect(result.current?.isLoading).toBe(true);
    await flush();

    expect(api.getCodeNotes).toHaveBeenCalledWith(projectId);
    expect(result.current?.isLoading).toBe(false);
    expect(result.current?.turns.map((turn) => [turn.role, turn.content])).toEqual([
      ["user", "Explain this"],
      ["assistant", "It stores the count."],
      ["user", "What does the 0 do?"],
      ["assistant", "The starting value."],
    ]);
    expect(result.current?.turns[0].selection).toEqual(selection);
    expect(result.current?.turns[2].selection).toBeUndefined();
  });

  it("never writes what was said to browser storage, so a second account can't read it", async () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: true }));
    answer("It stores the count.");
    await flush();

    expect(result.current?.turns).toHaveLength(2);
    const stored = Object.keys(sessionStorage).map((key) => sessionStorage.getItem(key) ?? "");
    expect(stored.join("")).not.toContain("It stores the count.");
    expect(Object.keys(sessionStorage)).toEqual([`code_notes_view_7_${projectId}`]);
  });

  it("saves a finished exchange, and stamps both its turns with the saved note", async () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: true }));
    answer("It stores the count.");
    await flush();

    expect(api.saveCodeNote).toHaveBeenCalledWith(projectId, {
      question: "Explain this",
      answer: "It stores the count.",
      selection,
    });
    const noteIds = result.current!.turns.map((turn) => turn.noteId);
    expect(noteIds[0]).toBeDefined();
    expect(noteIds[1]).toBe(noteIds[0]);
  });

  it("doesn't save an answer that never arrived", async () => {
    renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: true }));
    act(() => lastStream().fail(new Error("Connection lost")));
    await flush();

    expect(api.saveCodeNote).not.toHaveBeenCalled();
  });

  it("reopens the panel after a reload, on the block it was left pointed at", async () => {
    const first = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: false }));
    first.unmount();

    forgetLoadedThreadsForTests();
    vi.mocked(api.getCodeNotes).mockResolvedValue([
      { id: 21, question: "Explain this", answer: "It stores the count.", selection },
    ]);

    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.restore(projectId));
    await flush();

    expect(result.current?.isOpen).toBe(true);
    expect(result.current?.selection).toEqual(selection);
    expect(result.current?.turns).toHaveLength(2);
  });

  it("leaves the panel closed after a reload if it was closed", () => {
    const first = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: false }));
    act(() => codeLens.close(projectId));
    first.unmount();

    forgetLoadedThreadsForTests();
    vi.mocked(api.getCodeNotes).mockClear();

    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.restore(projectId));
    expect(result.current).toBeNull();
    expect(api.getCodeNotes).not.toHaveBeenCalled();
  });

  it("wipes one exchange - the question and its answer together - and leaves the rest", async () => {
    vi.mocked(api.getCodeNotes).mockResolvedValue([
      { id: 31, question: "Explain this", answer: "It stores the count.", selection },
      { id: 32, question: "And the 0?", answer: "The starting value." },
    ]);

    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.reopen(projectId));
    await flush();

    act(() => codeLens.deleteExchange(projectId, "note-31"));
    expect(api.deleteCodeNote).toHaveBeenCalledWith(projectId, 31);
    expect(result.current?.turns.map((turn) => turn.content)).toEqual(["And the 0?", "The starting value."]);
  });

  it("deletes an exchange that never reached the server without calling it", async () => {
    vi.mocked(api.saveCodeNote).mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: true }));
    answer("It stores the count.");
    await flush();

    const exchangeId = result.current!.turns[0].exchangeId;
    act(() => codeLens.deleteExchange(projectId, exchangeId));

    expect(api.deleteCodeNote).not.toHaveBeenCalled();
    expect(result.current?.turns).toEqual([]);
  });

  it("puts the thread back if the server refuses a delete", async () => {
    vi.mocked(api.getCodeNotes).mockResolvedValue([
      { id: 41, question: "Explain this", answer: "It stores the count." },
    ]);
    vi.mocked(api.deleteCodeNote).mockRejectedValue(new Error("Couldn't delete this note"));

    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.reopen(projectId));
    await flush();

    act(() => codeLens.deleteExchange(projectId, "note-41"));
    await flush();

    expect(result.current?.error).toBe("Couldn't delete this note");
    expect(result.current?.turns).toHaveLength(2);
  });

  it("carries on with an empty transcript when the saved notes can't be fetched", async () => {
    vi.mocked(api.getCodeNotes).mockRejectedValue(new Error("Couldn't load your code notes"));

    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.reopen(projectId));
    await flush();

    expect(result.current?.isLoading).toBe(false);
    expect(result.current?.error).toBe("Couldn't load your code notes");

    act(() => codeLens.ask(projectId, "Where is routing set up?"));
    expect(api.streamCodeInsight).toHaveBeenCalled();
  });

  it("drops the thread when the account signs out, so the next one can't read it", async () => {
    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.open(projectId, selection, { explain: true }));
    answer("It stores the count.");
    await flush();
    expect(result.current?.turns).toHaveLength(2);

    act(() => clearSignedInState());

    expect(result.current).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it("asks the server again after a sign-out rather than reusing what was loaded", async () => {
    vi.mocked(api.getCodeNotes).mockResolvedValue([
      { id: 51, question: "Explain this", answer: "Divyanshu's note." },
    ]);
    renderHook(() => useCodeLens(projectId));
    act(() => codeLens.reopen(projectId));
    await flush();

    act(() => clearSignedInState());
    vi.mocked(api.getCodeNotes).mockResolvedValue([]);

    const { result } = renderHook(() => useCodeLens(projectId));
    act(() => codeLens.reopen(projectId));
    await flush();

    expect(api.getCodeNotes).toHaveBeenCalledTimes(2);
    expect(result.current?.turns).toEqual([]);
  });

  it("keeps threads separate per project", async () => {
    const other = `project-${Math.random()}`;
    const { result: first } = renderHook(() => useCodeLens(projectId));
    const { result: second } = renderHook(() => useCodeLens(other));

    act(() => codeLens.open(projectId, selection, { explain: false }));
    await flush();

    expect(first.current).not.toBeNull();
    expect(second.current).toBeNull();
  });
});
