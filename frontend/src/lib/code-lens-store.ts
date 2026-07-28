/**
 * The code lens thread, per project, outside React so it survives switching panels and tabs.
 *
 * Handles: loading a project's saved notes once, appending a question and streaming its answer into place, saving the
 * finished exchange, deleting one exchange or clearing the thread, and exposing all of it to components through a
 * subscription.
 *
 * A question and its answer share one exchange id, because that pair is what deleting a note removes - dropping an
 * answer alone would leave a question hanging. A stream that fails keeps whatever arrived rather than discarding the
 * turn.
 *
 * It registers its own reset with the session module: this is module state, which outlives a client-side route
 * change, and not clearing it once leaked one account's transcript to the next person who signed in on the same
 * browser.
 */
import { useCallback, useSyncExternalStore } from "react";
import { api, getUserInfo } from "./api";
import { onSignOut } from "./session";
import type { CodeNote, CodeSelection } from "./types";

export interface LensTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  at?: string;
  isStreaming?: boolean;
  selection?: CodeSelection;
  exchangeId: string;
  noteId?: number;
}

export interface LensThread {
  isOpen: boolean;
  selection: CodeSelection | null;
  turns: LensTurn[];
  isBusy: boolean;
  isLoading: boolean;
  error: string | null;
}

const MAX_HISTORY_TURNS = 40;
const MAX_TURN_CHARS = 4000;

const threads = new Map<string, LensThread>();
const listeners = new Map<string, Set<() => void>>();
const loaded = new Set<string>();
let lastTurnId = Date.now();

const STORAGE_PREFIX = "code_notes_view_";

const nextTurnId = () => String(++lastTurnId);
const now = () => new Date().toISOString();

const storageKey = (projectId: string) => `${STORAGE_PREFIX}${getUserInfo()?.id ?? "anon"}_${projectId}`;

const isSelection = (value: unknown): value is CodeSelection => {
  const selection = value as CodeSelection | null;
  return !!selection && typeof selection.path === "string" && typeof selection.code === "string"
    && typeof selection.startLine === "number" && typeof selection.endLine === "number";
};

function readSavedView(projectId: string): { isOpen: boolean; selection: CodeSelection | null } {
  try {
    const raw = sessionStorage.getItem(storageKey(projectId));
    if (!raw) return { isOpen: false, selection: null };
    const saved = JSON.parse(raw) as { isOpen?: unknown; selection?: unknown } | null;
    return {
      isOpen: saved?.isOpen === true,
      selection: isSelection(saved?.selection) ? saved.selection : null,
    };
  } catch {
    return { isOpen: false, selection: null };
  }
}

function saveView(projectId: string) {
  const thread = threads.get(projectId);
  try {
    if (!thread) sessionStorage.removeItem(storageKey(projectId));
    else sessionStorage.setItem(storageKey(projectId), JSON.stringify({
      isOpen: thread.isOpen,
      selection: thread.selection,
    }));
  } catch {
  }
}

const getThread = (projectId: string): LensThread | null => threads.get(projectId) ?? null;

function noteToTurns(note: CodeNote): LensTurn[] {
  const exchangeId = `note-${note.id}`;
  const selection = isSelection(note.selection) ? note.selection : undefined;
  return [
    {
      id: `${exchangeId}-q`,
      role: "user",
      content: note.question,
      at: note.createdAt,
      exchangeId,
      noteId: note.id,
      ...(selection ? { selection } : {}),
    },
    {
      id: `${exchangeId}-a`,
      role: "assistant",
      content: note.answer,
      at: note.createdAt,
      exchangeId,
      noteId: note.id,
    },
  ];
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong. Please try again.";

function loadNotes(projectId: string) {
  if (loaded.has(projectId)) return;
  loaded.add(projectId);

  void api.getCodeNotes(projectId)
    .then((notes) => {
      const saved = notes.flatMap(noteToTurns);
      const savedIds = new Set(notes.map((note) => note.id));
      update(projectId, (current) => ({
        isLoading: false,
        turns: [
          ...saved,
          ...current.turns.filter((turn) => turn.noteId === undefined || !savedIds.has(turn.noteId)),
        ],
      }), { persist: false });
    })
    .catch((error: unknown) => {
      loaded.delete(projectId);
      update(projectId, () => ({ isLoading: false, error: errorMessage(error) }), { persist: false });
    });
}

const selectionKey = (selection: CodeSelection) =>
  `${selection.path}:${selection.startLine}-${selection.endLine}:${selection.code}`;

function selectionForNextTurn(thread: LensThread): CodeSelection | undefined {
  if (!thread.selection) return undefined;
  const lastQuoted = [...thread.turns].reverse().find((turn) => turn.selection)?.selection;
  if (lastQuoted && selectionKey(lastQuoted) === selectionKey(thread.selection)) return undefined;
  return thread.selection;
}

function emit(projectId: string) {
  listeners.get(projectId)?.forEach((listener) => listener());
}

function update(
  projectId: string,
  change: (thread: LensThread) => Partial<LensThread>,
  { persist = true }: { persist?: boolean } = {}
) {
  const current = getThread(projectId);
  if (!current) return;
  threads.set(projectId, { ...current, ...change(current) });
  if (persist) saveView(projectId);
  emit(projectId);
}

function setThread(projectId: string, thread: LensThread) {
  threads.set(projectId, thread);
  saveView(projectId);
  emit(projectId);
}

function openThread(projectId: string, selection: CodeSelection | null) {
  const existing = getThread(projectId);
  setThread(projectId, {
    isOpen: true,
    selection,
    turns: existing?.turns ?? [],
    isBusy: existing?.isBusy ?? false,
    isLoading: !loaded.has(projectId),
    error: null,
  });
  loadNotes(projectId);
}

function subscribe(projectId: string, listener: () => void) {
  let projectListeners = listeners.get(projectId);
  if (!projectListeners) {
    projectListeners = new Set();
    listeners.set(projectId, projectListeners);
  }
  projectListeners.add(listener);
  return () => {
    projectListeners.delete(listener);
  };
}

function persistExchange(
  projectId: string,
  exchangeId: string,
  question: string,
  answer: string,
  selection?: CodeSelection
) {
  void api.saveCodeNote(projectId, { question, answer, selection })
    .then((note) => update(projectId, (current) => ({
      turns: current.turns.map((turn) => (turn.exchangeId === exchangeId ? { ...turn, noteId: note.id } : turn)),
    }), { persist: false }))
    .catch((error: unknown) => console.warn("Couldn't save this code note", error));
}

function streamAnswer(
  projectId: string,
  kind: "explain" | "ask",
  exchangeId: string,
  question: string,
  selection: CodeSelection | null,
  quoted: CodeSelection | undefined,
  askBody?: { question: string; history: { role: "user" | "assistant"; content: string }[] }
) {
  const answerId = nextTurnId();
  update(projectId, (current) => ({
    turns: [...current.turns, {
      id: answerId, role: "assistant", content: "", at: now(), isStreaming: true, exchangeId,
    }],
  }), { persist: false });

  const body = askBody === undefined ? { ...selection } : { ...(selection ?? {}), ...askBody };

  const settle = (current: LensThread) => current.turns
    .map((turn) => (turn.id === answerId ? { ...turn, isStreaming: false } : turn))
    .filter((turn) => turn.id !== answerId || turn.content.trim().length > 0);

  api.streamCodeInsight(
    projectId,
    kind,
    body,
    (chunk) => update(projectId, (current) => ({
      turns: current.turns.map((turn) =>
        turn.id === answerId ? { ...turn, content: turn.content + chunk } : turn
      ),
    }), { persist: false }),
    () => {
      const answer = getThread(projectId)?.turns.find((turn) => turn.id === answerId)?.content ?? "";
      update(projectId, (current) => ({ isBusy: false, turns: settle(current) }), { persist: false });
      if (answer.trim()) persistExchange(projectId, exchangeId, question, answer, quoted ?? selection ?? undefined);
    },
    (error) => update(projectId, (current) => ({
      isBusy: false,
      error: errorMessage(error),
      turns: settle(current),
    }), { persist: false })
  );
}

export const codeLens = {
  open(projectId: string, selection: CodeSelection, { explain }: { explain: boolean }) {
    openThread(projectId, selection);
    if (explain) void this.explain(projectId);
  },

  reopen(projectId: string) {
    openThread(projectId, getThread(projectId)?.selection ?? readSavedView(projectId).selection);
  },

  restore(projectId: string) {
    if (getThread(projectId)) return;
    const view = readSavedView(projectId);
    if (view.isOpen) openThread(projectId, view.selection);
  },

  close(projectId: string) {
    update(projectId, () => ({ isOpen: false }));
  },

  clear(projectId: string) {
    update(projectId, () => ({ turns: [], error: null }), { persist: false });
    void api.clearCodeNotes(projectId).catch((error: unknown) => {
      loaded.delete(projectId);
      update(projectId, () => ({ error: errorMessage(error), isLoading: true }), { persist: false });
      loadNotes(projectId);
    });
  },

  deleteExchange(projectId: string, exchangeId: string) {
    const noteId = getThread(projectId)?.turns.find((turn) => turn.exchangeId === exchangeId)?.noteId;
    update(projectId, (current) => ({
      turns: current.turns.filter((turn) => turn.exchangeId !== exchangeId),
      error: null,
    }), { persist: false });

    if (noteId === undefined) return;
    void api.deleteCodeNote(projectId, noteId).catch((error: unknown) => {
      loaded.delete(projectId);
      update(projectId, () => ({ error: errorMessage(error), isLoading: true }), { persist: false });
      loadNotes(projectId);
    });
  },

  clearSelection(projectId: string) {
    update(projectId, () => ({ selection: null }));
  },

  explain(projectId: string) {
    const thread = getThread(projectId);
    if (!thread?.selection || thread.isBusy) return;

    const selection = thread.selection;
    const exchangeId = nextTurnId();
    const quoted = selectionForNextTurn(thread) ?? selection;
    update(projectId, (current) => ({
      isBusy: true,
      error: null,
      selection: null,
      turns: [...current.turns, {
        id: nextTurnId(),
        role: "user",
        content: "Explain this",
        at: now(),
        exchangeId,
        selection: quoted,
      }],
    }));

    streamAnswer(projectId, "explain", exchangeId, "Explain this", selection, quoted);
  },

  ask(projectId: string, question: string) {
    const thread = getThread(projectId);
    const text = question.trim();
    if (!thread || thread.isBusy || !text) return;

    const selection = thread.selection;
    const exchangeId = nextTurnId();
    const quoted = selectionForNextTurn(thread);
    const history = thread.turns
      .filter((turn) => turn.content.trim().length > 0)
      .slice(-MAX_HISTORY_TURNS)
      .map(({ role, content }) => ({ role, content: content.slice(0, MAX_TURN_CHARS) }));
    update(projectId, (current) => ({
      isBusy: true,
      error: null,
      selection: null,
      turns: [...current.turns, {
        id: nextTurnId(),
        role: "user",
        content: text,
        at: now(),
        exchangeId,
        ...(quoted ? { selection: quoted } : {}),
      }],
    }));

    streamAnswer(projectId, "ask", exchangeId, text, selection, quoted, { question: text, history });
  },

  dismissError(projectId: string) {
    update(projectId, () => ({ error: null }), { persist: false });
  },
};

onSignOut(() => {
  const projectIds = [...threads.keys()];
  threads.clear();
  loaded.clear();
  projectIds.forEach(emit);
});

export function forgetLoadedThreadsForTests() {
  threads.clear();
  loaded.clear();
}

export function useCodeLens(projectId: string): LensThread | null {
  const subscribeToProject = useCallback((listener: () => void) => subscribe(projectId, listener), [projectId]);
  const getProjectThread = useCallback(() => getThread(projectId), [projectId]);
  return useSyncExternalStore(subscribeToProject, getProjectThread);
}
