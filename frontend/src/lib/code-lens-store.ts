import { useCallback, useSyncExternalStore } from "react";
import { api, getUserInfo } from "./api";
import { onSignOut } from "./session";
import type { CodeNote, CodeSelection } from "./types";

export interface LensTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** When it was said, for the timestamp under the message. Optional: a turn without one just shows none. */
  at?: string;
  /** True while the answer is still arriving, so the panel can show it building up. */
  isStreaming?: boolean;
  /**
   * Set on the turn that first asked about this block, so the snippet appears inline in the transcript
   * where the subject changed. Follow-ups about the same block don't repeat it.
   */
  selection?: CodeSelection;
  /**
   * The question and the answer it got share one id, because that pair is what "delete this note" deletes -
   * removing an answer on its own would leave a question hanging with nothing under it.
   */
  exchangeId: string;
  /** The saved row behind this exchange, once written. Absent while a save is in flight, or if it failed. */
  noteId?: number;
}

export interface LensThread {
  /** False once dismissed - the conversation is kept, so reopening continues it rather than starting over. */
  isOpen: boolean;
  /**
   * The block the next question will carry, or null for a question about the project in general.
   *
   * <p><b>One question's worth.</b> Sending clears it: the block is quoted on the turn that asked about it,
   * and the "Asking about" chip goes away rather than silently staying attached to everything typed
   * afterwards. Selecting again is what points the next question at something.
   */
  selection: CodeSelection | null;
  turns: LensTurn[];
  isBusy: boolean;
  /** True while the saved thread is being fetched, so an empty panel doesn't read as "you've asked nothing". */
  isLoading: boolean;
  error: string | null;
}

/** Mirrors the backend's `AskCodeRequest`/`CodeChatTurn` limits, so a long thread never gets a request rejected. */
const MAX_HISTORY_TURNS = 40;
const MAX_TURN_CHARS = 4000;

/**
 * The code lens conversation: one running thread per project, covering whatever code has been asked about -
 * or none in particular, since a question doesn't need a selection.
 *
 * <p>Selecting a block doesn't start a new conversation - it says what the *next* question is about, and the
 * snippet is then attached to that turn, so the transcript reads as a history of the whole project: "here's
 * the bit I asked about, here's what it said, then this other bit...". A selection lasts exactly one
 * question; sending spends it, so the block sits in the transcript rather than trailing the composer.
 *
 * <p><b>Kept on the server, per user.</b> Every finished exchange is saved through `/code/notes`, which scopes
 * reads and writes alike to the signed-in caller - so the thread is still there on the next visit or another
 * device, and two members of a shared project never see each other's notes. It lasts until its author clears
 * the thread or deletes an exchange; nothing expires it. This map is a cache of that, and the only thing put
 * in browser storage is whether the panel was open and what it was pointed at - UI state, not anyone's notes.
 */
const threads = new Map<string, LensThread>();
const listeners = new Map<string, Set<() => void>>();
/** Projects whose saved thread has already been fetched, so the server is asked once per page load. */
const loaded = new Set<string>();
let lastTurnId = Date.now();

const STORAGE_PREFIX = "code_notes_view_";

const nextTurnId = () => String(++lastTurnId);
const now = () => new Date().toISOString();

/**
 * Keyed by user as well as project. Two accounts used in the same browser must not pick up each other's view
 * of a project - the notes themselves live on the server, but even "which block was I asking about" is theirs.
 */
const storageKey = (projectId: string) => `${STORAGE_PREFIX}${getUserInfo()?.id ?? "anon"}_${projectId}`;

const isSelection = (value: unknown): value is CodeSelection => {
  const selection = value as CodeSelection | null;
  return !!selection && typeof selection.path === "string" && typeof selection.code === "string"
    && typeof selection.startLine === "number" && typeof selection.endLine === "number";
};

/** What the panel looked like last time, not what was said in it. The turns come from the server. */
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
    // Storage full or unavailable (private mode) - the panel still works for this page load.
  }
}

const getThread = (projectId: string): LensThread | null => threads.get(projectId) ?? null;

/** A saved exchange becomes the two turns it was: the question that was asked, then the answer it got. */
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

/**
 * Fetches the saved thread once per page load. Anything asked while it was in flight keeps its place after
 * the saved turns rather than being thrown away, and an exchange that saved itself in the meantime is matched
 * by id so it isn't shown twice.
 */
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
      // Not fatal: the panel still answers questions, they just start from a blank transcript this load.
      loaded.delete(projectId);
      update(projectId, () => ({ isLoading: false, error: errorMessage(error) }), { persist: false });
    });
}

/** Identifies a block, so a follow-up about the same one doesn't re-quote it. */
const selectionKey = (selection: CodeSelection) =>
  `${selection.path}:${selection.startLine}-${selection.endLine}:${selection.code}`;

/**
 * The snippet is attached only when the subject has actually moved on. Since sending clears the selection,
 * this only ever suppresses a quote when the reader picks the *same* block straight after asking about it -
 * where the quote is still right there above, and repeating it would just be noise.
 */
function selectionForNextTurn(thread: LensThread): CodeSelection | undefined {
  if (!thread.selection) return undefined;
  const lastQuoted = [...thread.turns].reverse().find((turn) => turn.selection)?.selection;
  if (lastQuoted && selectionKey(lastQuoted) === selectionKey(thread.selection)) return undefined;
  return thread.selection;
}

function emit(projectId: string) {
  listeners.get(projectId)?.forEach((listener) => listener());
}

/**
 * `persist: false` is for anything that doesn't change what the panel is pointed at - streamed chunks and
 * arriving turns. Only `isOpen`/`selection` are written to storage at all.
 */
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

/** Opens (or re-opens) the thread and makes sure the saved notes are on their way. */
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

/**
 * Writes a finished exchange to the server and stamps both its turns with the saved row's id, which is what
 * lets "delete this note" reach past this page load. A failure isn't shown: the answer is on screen and still
 * readable, it just won't be there next time.
 */
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

/**
 * Streams the reply into a placeholder turn that grows as text arrives, rather than appearing whole once the
 * whole answer is ready - the same way the project chat reads.
 */
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

  // A question with no selection is about the project as a whole - the selection fields are simply left out.
  const body = askBody === undefined ? { ...selection } : { ...(selection ?? {}), ...askBody };

  const settle = (current: LensThread) => current.turns
    .map((turn) => (turn.id === answerId ? { ...turn, isStreaming: false } : turn))
    // An answer that arrived completely empty would otherwise sit there as a blank bubble.
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
      // Only a complete answer is kept - a reply that failed or arrived empty isn't worth a saved note.
      if (answer.trim()) persistExchange(projectId, exchangeId, question, answer, quoted ?? selection ?? undefined);
    },
    (error) => update(projectId, (current) => ({
      isBusy: false,
      error: errorMessage(error),
      // Drop the empty placeholder so the error isn't shown under a blank reply.
      turns: settle(current),
    }), { persist: false })
  );
}

export const codeLens = {
  /**
   * Points the panel at a selection. `explain` runs the one-shot explanation immediately; otherwise the
   * panel just opens, ready for a question about it. Existing turns are always kept.
   *
   * <p>The selection lasts one question either way - see {@link LensThread.selection}.
   */
  open(projectId: string, selection: CodeSelection, { explain }: { explain: boolean }) {
    openThread(projectId, selection);
    if (explain) void this.explain(projectId);
  },

  /**
   * Opens the panel without a selection - the toolbar button, so the conversation can be picked up at any
   * time rather than only by selecting code first. Whatever was last asked about stays the subject.
   */
  reopen(projectId: string) {
    openThread(projectId, getThread(projectId)?.selection ?? readSavedView(projectId).selection);
  },

  /**
   * Puts a reader back where they were after a reload: the panel reopens if it was open, on the block it was
   * pointed at, and the saved notes are fetched. Does nothing if it was closed - this is the only reason the
   * panel's own open/selection state is kept in storage at all.
   */
  restore(projectId: string) {
    if (getThread(projectId)) return;
    const view = readSavedView(projectId);
    if (view.isOpen) openThread(projectId, view.selection);
  },

  /** Hides the panel but keeps the conversation, so reopening it continues where it left off. */
  close(projectId: string) {
    update(projectId, () => ({ isOpen: false }));
  },

  /** Throws the whole thread away, on the server as well as here. */
  clear(projectId: string) {
    update(projectId, () => ({ turns: [], error: null }), { persist: false });
    void api.clearCodeNotes(projectId).catch((error: unknown) => {
      // They're still on the server, so say so and put them back rather than pretending they're gone.
      loaded.delete(projectId);
      update(projectId, () => ({ error: errorMessage(error), isLoading: true }), { persist: false });
      loadNotes(projectId);
    });
  },

  /** Wipes one exchange - the question, its answer and the snippet it quoted - leaving the rest alone. */
  deleteExchange(projectId: string, exchangeId: string) {
    const noteId = getThread(projectId)?.turns.find((turn) => turn.exchangeId === exchangeId)?.noteId;
    update(projectId, (current) => ({
      turns: current.turns.filter((turn) => turn.exchangeId !== exchangeId),
      error: null,
    }), { persist: false });

    // An exchange that never reached the server (its save failed) only ever existed here, so dropping it
    // here is the whole job.
    if (noteId === undefined) return;
    void api.deleteCodeNote(projectId, noteId).catch((error: unknown) => {
      loaded.delete(projectId);
      update(projectId, () => ({ error: errorMessage(error), isLoading: true }), { persist: false });
      loadNotes(projectId);
    });
  },

  /**
   * Drops the block before it has been asked about - the chip's ×, for changing your mind after selecting.
   * Sending already clears it, so this is only for the gap between selecting and asking.
   */
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
      // Spent, exactly as in `ask`.
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

  /** A question about the selected block if there is one, otherwise about the project in general. */
  ask(projectId: string, question: string) {
    const thread = getThread(projectId);
    const text = question.trim();
    if (!thread || thread.isBusy || !text) return;

    const selection = thread.selection;
    const exchangeId = nextTurnId();
    const quoted = selectionForNextTurn(thread);
    // The history sent is what came before this question; the question itself is shown straight away.
    const history = thread.turns
      .filter((turn) => turn.content.trim().length > 0)
      .slice(-MAX_HISTORY_TURNS)
      .map(({ role, content }) => ({ role, content: content.slice(0, MAX_TURN_CHARS) }));
    update(projectId, (current) => ({
      isBusy: true,
      error: null,
      // Sending spends the selection: it rides on this question and is quoted on this turn, and the next
      // question starts from the project again. See `open` for why it doesn't linger.
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

  /** Drops a failed turn's error without discarding the conversation around it. */
  dismissError(projectId: string) {
    update(projectId, () => ({ error: null }), { persist: false });
  },
};

/**
 * A thread is one person's. This map outlives a route change, so without this a sign-out followed by a
 * sign-in on the same browser showed the next account the previous one's transcript - the very leak that
 * moving the notes onto the server was meant to close.
 */
onSignOut(() => {
  const projectIds = [...threads.keys()];
  threads.clear();
  loaded.clear();
  // Anything still mounted re-reads an empty store rather than keeping the last render on screen.
  projectIds.forEach(emit);
});

/** Test hook: forgets everything held in memory, the way a page reload would, leaving storage alone. */
export function forgetLoadedThreadsForTests() {
  threads.clear();
  loaded.clear();
}

export function useCodeLens(projectId: string): LensThread | null {
  const subscribeToProject = useCallback((listener: () => void) => subscribe(projectId, listener), [projectId]);
  const getProjectThread = useCallback(() => getThread(projectId), [projectId]);
  return useSyncExternalStore(subscribeToProject, getProjectThread);
}
