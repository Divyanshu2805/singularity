/**
 * The project build chat, per project, outside React so it survives switching tabs and panels.
 *
 * Handles: loading history, sending a message and following the answer as it streams, showing the files a turn is
 * writing while it writes them, taking the saved turn from the server the moment it is saved, reattaching to a turn
 * already running on the server (after a refresh, or after the connection dropped), stopping one, retrying one that
 * did not finish, and exposing all of it to components through a subscription.
 *
 * The server owns a turn and says how it ended. While the answer streams this store reads the text itself
 * (lib/generation-protocol.ts) so the chat and the editor can show work in progress, but that reading is a preview:
 * the stream ends with the turn's outcome, sent only after the turn is saved, and the saved turn then replaces the
 * preview - its events, and exactly the files it wrote. Before that, a finished answer kept showing the browser's own
 * reading for the rest of the session, which is how a file the server had discarded stayed on screen with a tick
 * beside it.
 *
 * It no longer sends a request again by itself. An answer that stopped short of its plan used to be retried from
 * here, racing the server, which was still saving the same turn and refused the retry. The server now carries an
 * unfinished reply on within the turn; what is left for this store is the Retry the person can press on a turn that
 * still ended unfinished, failed or stopped.
 *
 * A request whose stream fails to open with a server error is not assumed lost. The gateway once dropped a stale
 * connection on exactly such a request: the browser was told it had failed while the server had started the turn,
 * so the person saw "failed", pressed Retry and was told a response was already running. The store now asks
 * whether a turn for that very request is running and joins it; only when there is none is it a failure.
 *
 * A request the server refuses because a turn is already running is not dropped silently: the placeholder pair is
 * removed, a notice says why, and the conversation is reloaded - which reattaches to the running turn when it is this
 * person's own. A connection that breaks mid-answer is not a failed turn either, since the turn carries on without a
 * viewer: the store asks whether it is still running and either reattaches or collects the saved result. When it
 * can do neither - the server restarted mid-turn and has no trace of it, or cannot be reached at all - the question is
 * kept in this browser with the reason, so a reload brings it back with Retry instead of an empty conversation; a
 * reload that finds the turn saved after all drops the kept copy. A turn that was stopped is never reattached to by a
 * reconnect that was already under way.
 *
 * Files changed by the turn in progress are layered over the files as they were when it started, and rebuilt from the
 * text every time it changes. So when the server takes something back - a file cut off half-way, before it carries
 * the reply on - the editor stops showing it too.
 *
 * Teaching mode belongs to a turn. A message is sent with the mode that was chosen when it was sent, the reply is
 * marked with it at once so the chat need not wait for the saved turn, the saved turn carries the same mark back
 * after a reload, and a retry is sent the way the turn it retries was.
 *
 * The files a turn wrote are kept here so the editor can show them without asking the server again. Something else
 * can change those files - a save by hand, a restore from the history - and then this copy is the stale one, so
 * filesChangedOutside drops it (for the paths named, or for all of them) and the editor reads from the server. A
 * saved reply also carries the revision its files were published as, which is what Undo on that turn sends back.
 * Clearing the chat deletes the caller's conversation on the server and empties it here; the files are not touched.
 *
 * It registers its own reset with the session module: module state outlives a client-side route change, and not
 * clearing it once leaked one account's chat to the next person who signed in on the same browser.
 */
import { useCallback, useSyncExternalStore } from "react";
import { api, ApiRequestError, GenerationFailedError, StreamInterruptedError, getUserInfo, type ChatStreamHandlers } from "./api";
import { parseGenerationText, turnFiles } from "./generation-protocol";
import { ChatEventType, type ActiveGeneration, type ChatEvent, type TurnOutcome } from "./types";
import { onSignOut } from "./session";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  createdAt?: string;
  startedAt?: string;
  thoughtSeconds?: number;
  status?: string;
  outcome?: TurnOutcome;
  notSent?: boolean;
  wasStopped?: boolean;
  instantLength?: number;
  events?: ChatEvent[];
  error?: string;
  teaching?: boolean;
  turnId?: number;
  overview?: string;
  revisionId?: number | null;
}

export interface ProjectChatState {
    messages: ChatMessage[];
    isHistoryLoaded: boolean;
    historyError: string | null;
    isStreaming: boolean;
    streamingFiles: ReadonlyMap<string, string>;
    completedFiles: ReadonlyMap<string, string>;
    deletedFiles: ReadonlySet<string>;
    diffBaselines: ReadonlyMap<string, string>;
    lastTurnFiles: readonly string[];
    hasUnsavedTurn: boolean;
    lastSentMessage: string | null;
    notice: string | null;
}

interface TurnInProgress {
    projectId: string;
    turnId: number;
    aiMessageId: string;
    userMessageId: string;
    askedAt: number;
    prompt: string;
    completedBefore: ReadonlyMap<string, string>;
    deletedBefore: ReadonlySet<string>;
    reconnects: number;
    stopped: boolean;
}

const EMPTY_FILES: ReadonlyMap<string, string> = new Map();

const INITIAL_STATE: ProjectChatState = {
    messages: [],
    isHistoryLoaded: false,
    historyError: null,
    isStreaming: false,
    streamingFiles: EMPTY_FILES,
    completedFiles: EMPTY_FILES,
    deletedFiles: new Set<string>(),
    diffBaselines: EMPTY_FILES,
    lastTurnFiles: [],
    hasUnsavedTurn: false,
    lastSentMessage: null,
    notice: null,
};

export const STILL_WORKING_NOTICE = "Singularity is still working on your last request. Wait for it to finish, or stop it first.";
const CONNECTION_LOST = "The connection was lost and couldn't be restored. Reload the page to see whether your request finished.";
const TURN_LOST = "This response was interrupted before it could be saved, so nothing was changed. Use Retry to send it again.";
const SAVED_TURN_RETRIES = 3;
const RECONNECT_RETRIES = 5;
const MAX_RECONNECTS = 12;

const pause = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const TURN_OUTCOMES: readonly TurnOutcome[] = ["SAVED", "ANSWERED", "INCOMPLETE", "NOT_SAVED", "EMPTY", "FAILED", "STOPPED", "OUT_OF_BUDGET"];

export const asTurnOutcome = (value: string | undefined | null): TurnOutcome | undefined =>
    TURN_OUTCOMES.find((outcome) => outcome === value);

export const turnOutcome = (events: readonly ChatEvent[] | undefined): TurnOutcome | undefined =>
    asTurnOutcome(events?.find((event) => event.type === ChatEventType.THOUGHT)?.metadata);

export const isWorthRetrying = (outcome: TurnOutcome | undefined) =>
    !!outcome && outcome !== "SAVED" && outcome !== "ANSWERED";

const states = new Map<string, ProjectChatState>();
const listeners = new Map<string, Set<() => void>>();
const latestTurnIds = new Map<string, number>();
const cancelStreams = new Map<string, () => void>();
const turnsInProgress = new Map<string, TurnInProgress>();
let lastMessageId = Date.now();

const baselineKey = (projectId: string) => `diff_baselines_${projectId}`;

const MAX_STORED_BASELINE_BYTES = 512_000;

function readStoredBaselines(projectId: string): Partial<ProjectChatState> {
    try {
        const raw = sessionStorage.getItem(baselineKey(projectId));
        if (!raw) return {};
        const saved = JSON.parse(raw) as { baselines?: [string, string][]; lastTurnFiles?: string[] };
        return {
            diffBaselines: new Map(saved.baselines ?? []),
            lastTurnFiles: saved.lastTurnFiles ?? [],
        };
    } catch {
        return {};
    }
}

function writeStoredBaselines(projectId: string, state: ProjectChatState) {
    try {
        if (state.diffBaselines.size === 0) {
            sessionStorage.removeItem(baselineKey(projectId));
            return;
        }
        const baselines: [string, string][] = [];
        let bytes = 0;
        for (const entry of state.diffBaselines) {
            bytes += entry[0].length + entry[1].length;
            if (bytes > MAX_STORED_BASELINE_BYTES) break;
            baselines.push(entry);
        }
        sessionStorage.setItem(
            baselineKey(projectId),
            JSON.stringify({ baselines, lastTurnFiles: state.lastTurnFiles })
        );
    } catch {
    }
}

function getState(projectId: string): ProjectChatState {
    let state = states.get(projectId);
    if (!state) {
        state = { ...INITIAL_STATE, ...readStoredBaselines(projectId) };
        states.set(projectId, state);
    }
    return state;
}

function update(projectId: string, change: (state: ProjectChatState) => Partial<ProjectChatState>) {
    const current = getState(projectId);
    const next = { ...current, ...change(current) };
    states.set(projectId, next);
    if (next.diffBaselines !== current.diffBaselines || next.lastTurnFiles !== current.lastTurnFiles) {
        writeStoredBaselines(projectId, next);
    }
    listeners.get(projectId)?.forEach((listener) => listener());
}

onSignOut(() => {
    cancelStreams.forEach((cancel) => {
        try {
            cancel();
        } catch {
        }
    });
    cancelStreams.clear();
    turnsInProgress.clear();
    latestTurnIds.clear();

    const projectIds = [...states.keys()];
    states.clear();
    projectIds.forEach((projectId) => listeners.get(projectId)?.forEach((listener) => listener()));
});

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

const nextMessageId = () => String(++lastMessageId);

interface FailedPrompt {
    content: string;
    error: string;
    failedAt: number;
    notSent: boolean;
}

const FAILED_PROMPT_PREFIX = "failed_prompt";

const failedPromptKey = (projectId: string) => `${FAILED_PROMPT_PREFIX}_${getUserInfo()?.id ?? "anon"}_${projectId}`;

function readFailedPrompt(projectId: string): FailedPrompt | null {
    try {
        const raw = localStorage.getItem(failedPromptKey(projectId));
        const saved = raw ? (JSON.parse(raw) as FailedPrompt) : null;
        return saved && typeof saved.content === "string" && saved.content ? saved : null;
    } catch {
        return null;
    }
}

function writeFailedPrompt(projectId: string, prompt: FailedPrompt | null) {
    try {
        if (prompt) localStorage.setItem(failedPromptKey(projectId), JSON.stringify(prompt));
        else localStorage.removeItem(failedPromptKey(projectId));
    } catch {
    }
}

const updateMessage = (messages: ChatMessage[], id: string, change: (message: ChatMessage) => Partial<ChatMessage>) =>
    messages.map((message) => (message.id === id ? { ...message, ...change(message) } : message));

function hasCaughtUp(saved: ChatMessage[], live: ChatMessage[]) {
    if (saved.length < live.length) return false;
    if (live[live.length - 1]?.role !== "assistant") return true;
    const lastSaved = saved[saved.length - 1];
    return lastSaved?.role === "assistant" && (lastSaved.events?.length ?? 0) > 0;
}

const toChatMessages = (history: Awaited<ReturnType<typeof api.getChatHistory>>): ChatMessage[] =>
    history.map((message) => ({
        id: message.id.toString(),
        role: message.role === "USER" ? "user" : "assistant",
        content: message.content ?? "",
        createdAt: message.createdAt,
        events: message.events,
        outcome: message.role === "ASSISTANT" ? turnOutcome(message.events) : undefined,
        teaching: message.role === "ASSISTANT" && !!message.teaching,
        ...(message.role === "ASSISTANT" ? { turnId: message.id, overview: message.overview || undefined } : {}),
        revisionId: message.role === "ASSISTANT" ? message.revisionId ?? null : undefined,
    }));

function historyHasTurn(messages: ChatMessage[], active: ActiveGeneration) {
    const last = messages[messages.length - 1];
    const question = messages[messages.length - 2];
    if (!last || !question || last.role !== "assistant" || question.role !== "user") return false;
    if (question.content !== active.userMessage || !last.events?.length) return false;
    const savedAt = Date.parse(question.createdAt ?? "");
    return Number.isFinite(savedAt) && savedAt >= Date.parse(active.startedAt) - 60_000;
}

function historyHasPrompt(messages: ChatMessage[], failed: FailedPrompt) {
    return messages.some((message) => {
        if (message.role !== "user" || message.content !== failed.content) return false;
        const savedAt = Date.parse(message.createdAt ?? "");
        return Number.isFinite(savedAt) && savedAt >= failed.failedAt - 60_000;
    });
}

function restoredFailedTurn(failed: FailedPrompt): ChatMessage[] {
    const at = new Date(failed.failedAt).toISOString();
    return [
        { id: nextMessageId(), role: "user", content: failed.content, createdAt: at },
        { id: nextMessageId(), role: "assistant", content: "", createdAt: at, error: failed.error, notSent: failed.notSent },
    ];
}

function withTurnFiles(turn: TurnInProgress, events: readonly ChatEvent[]) {
    const files = turnFiles(events);
    const completedFiles = new Map(turn.completedBefore);
    const deletedFiles = new Set(turn.deletedBefore);
    files.deleted.forEach((path) => {
        deletedFiles.add(path);
        completedFiles.delete(path);
    });
    files.written.forEach((content, path) => {
        completedFiles.set(path, content);
        deletedFiles.delete(path);
    });
    if (files.arriving) deletedFiles.delete(files.arriving.path);
    return { files, completedFiles, deletedFiles };
}

function isCurrent(turn: TurnInProgress) {
    return latestTurnIds.get(turn.projectId) === turn.turnId;
}

function isLive(turn: TurnInProgress) {
    return isCurrent(turn) && !turn.stopped;
}

function endTurn(turn: TurnInProgress) {
    cancelStreams.delete(turn.projectId);
    if (turnsInProgress.get(turn.projectId) === turn) turnsInProgress.delete(turn.projectId);
}

type Adoption = "adopted" | "absent" | "unreachable";

async function adoptSavedTurn(turn: TurnInProgress, attempt = 0): Promise<Adoption> {
    const { projectId, aiMessageId, userMessageId } = turn;
    let reachable = false;
    try {
        const history = toChatMessages(await api.getChatHistory(projectId));
        reachable = true;
        const reply = history[history.length - 1];
        const question = history[history.length - 2];
        if (!reply || reply.role !== "assistant" || !reply.events?.length || question?.content !== turn.prompt) {
            throw new Error("The turn is not in the saved conversation yet");
        }
        if (!isCurrent(turn)) return "adopted";

        update(projectId, (state) => {
            if (!state.messages.some((message) => message.id === aiMessageId)) return {};
            const { files, completedFiles, deletedFiles } = withTurnFiles(turn, reply.events ?? []);
            const lastTurnFiles = [...files.written.keys()];
            return {
                hasUnsavedTurn: false,
                isStreaming: false,
                streamingFiles: EMPTY_FILES,
                completedFiles,
                deletedFiles,
                lastTurnFiles,
                diffBaselines: new Map([...state.diffBaselines].filter(([path]) => lastTurnFiles.includes(path))),
                messages: state.messages.map((message) => {
                    if (message.id === aiMessageId) {
                        return {
                            ...message,
                            content: "",
                            events: reply.events,
                            outcome: reply.outcome ?? message.outcome,
                            teaching: reply.teaching || message.teaching,
                            turnId: reply.turnId,
                            overview: reply.overview,
                            revisionId: reply.revisionId ?? null,
                            createdAt: reply.createdAt ?? message.createdAt,
                            isStreaming: false,
                            status: undefined,
                            error: undefined,
                            wasStopped: undefined,
                        };
                    }
                    if (message.id === userMessageId && question?.role === "user") {
                        return { ...message, createdAt: question.createdAt ?? message.createdAt };
                    }
                    return message;
                }),
            };
        });
        return "adopted";
    } catch {
        if (attempt >= SAVED_TURN_RETRIES || !isCurrent(turn)) return reachable ? "absent" : "unreachable";
        await pause(1200 * (attempt + 1));
        return adoptSavedTurn(turn, attempt + 1);
    }
}

function failTurn(turn: TurnInProgress, message: string, notSent: boolean) {
    endTurn(turn);
    update(turn.projectId, (state) => ({
        isStreaming: false,
        streamingFiles: EMPTY_FILES,
        completedFiles: turn.completedBefore,
        deletedFiles: turn.deletedBefore,
        lastTurnFiles: [],
        diffBaselines: EMPTY_FILES,
        messages: updateMessage(state.messages, turn.aiMessageId, () => ({
            isStreaming: false,
            status: undefined,
            createdAt: new Date().toISOString(),
            error: message,
            notSent,
        })),
    }));
}

function giveUp(turn: TurnInProgress, message: string) {
    writeFailedPrompt(turn.projectId, {
        content: turn.prompt,
        error: message,
        failedAt: turn.askedAt,
        notSent: false,
    });
    failTurn(turn, message, false);
}

async function reconnect(turn: TurnInProgress, attempt = 0): Promise<void> {
    const { projectId, aiMessageId } = turn;
    if (!isLive(turn)) return;
    cancelStreams.delete(projectId);
    if (++turn.reconnects > MAX_RECONNECTS) {
        giveUp(turn, CONNECTION_LOST);
        return;
    }
    update(projectId, (state) => ({
        messages: updateMessage(state.messages, aiMessageId, () => ({ status: "Reconnecting" })),
    }));

    try {
        if (turn.reconnects > 1) await pause(Math.min(5000, 400 * turn.reconnects));
        const active = await api.getActiveGeneration(projectId);
        if (!isLive(turn)) return;
        if (active) {
            update(projectId, (state) => ({
                messages: updateMessage(state.messages, aiMessageId, () => ({ content: "", instantLength: 0 })),
            }));
            follow(turn, (handlers) => api.resumeChat(projectId, handlers), true);
            return;
        }
        const adoption = await adoptSavedTurn(turn);
        if (!isLive(turn)) return;
        if (adoption === "adopted") {
            endTurn(turn);
            return;
        }
        giveUp(turn, adoption === "absent" ? TURN_LOST : CONNECTION_LOST);
    } catch {
        if (!isLive(turn)) return;
        if (attempt >= RECONNECT_RETRIES) {
            giveUp(turn, CONNECTION_LOST);
            return;
        }
        await pause(Math.min(8000, 1000 * 2 ** attempt));
        return reconnect(turn, attempt + 1);
    }
}

function follow(turn: TurnInProgress, openStream: (handlers: ChatStreamHandlers) => () => void, isResume: boolean) {
    const { projectId, aiMessageId, userMessageId } = turn;
    let awaitingBacklog = isResume;
    let recoveredOnce = false;
    const baselines = new Map<string, Promise<string>>();
    const published = new Set<string>();

    const captureBaseline = (path: string) => {
        let baseline = baselines.get(path);
        if (!baseline) {
            baseline = api.getFileContent(projectId, path).catch(() => "");
            baselines.set(path, baseline);
        }
        return baseline;
    };

    const syncFiles = () => {
        const answer = getState(projectId).messages.find((message) => message.id === aiMessageId)?.content ?? "";
        const { files, completedFiles, deletedFiles } = withTurnFiles(turn, parseGenerationText(answer, { streaming: true }));

        if (files.arriving) captureBaseline(files.arriving.path);
        for (const path of [...files.written.keys(), ...files.edited]) {
            const baseline = captureBaseline(path);
            if (published.has(path)) continue;
            published.add(path);
            baseline.then((original) => {
                if (!isCurrent(turn)) return;
                update(projectId, (state) => ({ diffBaselines: new Map(state.diffBaselines).set(path, original) }));
            });
        }

        update(projectId, () => ({
            completedFiles,
            deletedFiles,
            streamingFiles: files.arriving ? new Map([[files.arriving.path, files.arriving.content]]) : EMPTY_FILES,
            lastTurnFiles: [...new Set([...files.written.keys(), ...files.edited])],
        }));
    };

    const cancel = openStream({
        onChunk: (chunk) => {
            const isBacklog = awaitingBacklog;
            awaitingBacklog = false;
            update(projectId, (state) => ({
                messages: updateMessage(state.messages, aiMessageId, (message) => ({
                    content: message.content + chunk,
                    status: undefined,
                    ...(isBacklog ? { instantLength: message.content.length + chunk.length } : {}),
                })),
            }));
            syncFiles();
        },
        onStatus: (line) => {
            update(projectId, (state) => ({
                messages: updateMessage(state.messages, aiMessageId, () => ({ status: line })),
            }));
        },
        onReplace: (text) => {
            awaitingBacklog = false;
            update(projectId, (state) => ({
                messages: updateMessage(state.messages, aiMessageId, () => ({ content: text, instantLength: text.length })),
            }));
            syncFiles();
        },
        onDone: (outcome) => {
            endTurn(turn);
            writeFailedPrompt(projectId, null);
            update(projectId, (state) => ({
                isStreaming: false,
                streamingFiles: EMPTY_FILES,
                hasUnsavedTurn: true,
                messages: updateMessage(state.messages, aiMessageId, () => ({
                    isStreaming: false,
                    status: undefined,
                    createdAt: new Date().toISOString(),
                    thoughtSeconds: Math.round((Date.now() - turn.askedAt) / 1000),
                    outcome: asTurnOutcome(outcome),
                })),
            }));
            void adoptSavedTurn(turn);
        },
        onClosed: () => void reconnect(turn),
        onGone: () => void reconnect(turn),
        onError: (error) => {
            if (error instanceof StreamInterruptedError) {
                void reconnect(turn);
                return;
            }
            if (!isResume && !recoveredOnce && error instanceof ApiRequestError && error.status >= 500) {
                recoveredOnce = true;
                void attachIfItStarted(turn, error);
                return;
            }
            failOpening(error);
        },
    });

    const failOpening = (error: Error) => {
            endTurn(turn);

            if (error instanceof ApiRequestError && error.status === 409) {
                update(projectId, (state) => ({
                    isStreaming: false,
                    streamingFiles: EMPTY_FILES,
                    notice: error.message || STILL_WORKING_NOTICE,
                    messages: state.messages.filter((message) => message.id !== aiMessageId && message.id !== userMessageId),
                }));
                void projectChat.loadHistory(projectId);
                return;
            }

            const notSent = !(error instanceof GenerationFailedError);
            if (!(error instanceof ApiRequestError && error.status === 401)) {
                writeFailedPrompt(projectId, {
                    content: turn.prompt,
                    error: error.message || "Something went wrong",
                    failedAt: Date.now(),
                    notSent,
                });
            }
            failTurn(turn, error.message || "Something went wrong", notSent);
    };

    const attachIfItStarted = async (failed: TurnInProgress, error: Error) => {
        try {
            const active = await api.getActiveGeneration(projectId);
            if (!isLive(failed)) return;
            if (active && active.userMessage === failed.prompt) {
                follow(failed, (handlers) => api.resumeChat(projectId, handlers), true);
                return;
            }
        } catch {
            if (!isLive(failed)) return;
        }
        failOpening(error);
    };

    cancelStreams.set(projectId, cancel);
}

function beginTurn(
    projectId: string,
    aiMessageId: string,
    userMessageId: string,
    askedAt: number,
    prompt: string
): TurnInProgress {
    const turnId = (latestTurnIds.get(projectId) ?? 0) + 1;
    latestTurnIds.set(projectId, turnId);
    const state = getState(projectId);
    const turn: TurnInProgress = {
        projectId,
        turnId,
        aiMessageId,
        userMessageId,
        askedAt,
        prompt,
        completedBefore: state.completedFiles,
        deletedBefore: state.deletedFiles,
        reconnects: 0,
        stopped: false,
    };
    turnsInProgress.set(projectId, turn);
    return turn;
}

export function useProjectChat(projectId: string): ProjectChatState {
    const subscribeToProject = useCallback((listener: () => void) => subscribe(projectId, listener), [projectId]);
    const getProjectState = useCallback(() => getState(projectId), [projectId]);
    return useSyncExternalStore(subscribeToProject, getProjectState);
}

async function restoreLastTurnDiffs(projectId: string) {
    if (getState(projectId).diffBaselines.size > 0) return;
    try {
        const { files } = await api.getLastTurnChanges(projectId);
        if (!files?.length) return;
        update(projectId, (state) => {
            if (state.isStreaming || state.hasUnsavedTurn || state.diffBaselines.size > 0) return {};
            return {
                diffBaselines: new Map(files.map((file) => [file.path, file.previousContent])),
                lastTurnFiles: files.map((file) => file.path),
            };
        });
    } catch {
    }
}

export const projectChat = {
    async loadHistory(projectId: string) {
        if (getState(projectId).isStreaming) {
            update(projectId, () => ({ isHistoryLoaded: true }));
            return;
        }
        try {
            const active = await api.getActiveGeneration(projectId).catch(() => null);
            const messages = toChatMessages(await api.getChatHistory(projectId));

            if (active && !getState(projectId).isStreaming && !historyHasTurn(messages, active)) {
                projectChat.resumeGeneration(projectId, messages, active);
                return;
            }

            const failed = active ? null : readFailedPrompt(projectId);
            if (failed && historyHasPrompt(messages, failed)) {
                writeFailedPrompt(projectId, null);
            } else if (failed) {
                update(projectId, (state) => {
                    if (state.isStreaming || state.messages.length > messages.length) return { isHistoryLoaded: true };
                    return {
                        messages: [...messages, ...restoredFailedTurn(failed)],
                        lastSentMessage: failed.content,
                        isHistoryLoaded: true,
                        historyError: null,
                        hasUnsavedTurn: false,
                    };
                });
                return;
            }

            update(projectId, (state) => {
                if (state.isStreaming) return { isHistoryLoaded: true };
                if (state.hasUnsavedTurn && !hasCaughtUp(messages, state.messages)) {
                    return { isHistoryLoaded: true, historyError: null };
                }
                return { messages, isHistoryLoaded: true, historyError: null, hasUnsavedTurn: false };
            });
            void restoreLastTurnDiffs(projectId);
        } catch (error) {
            update(projectId, () => ({
                isHistoryLoaded: true,
                historyError: error instanceof Error ? error.message : "Couldn't load the chat history",
            }));
        }
    },

    resumeGeneration(projectId: string, history: ChatMessage[], active: ActiveGeneration) {
        if (getState(projectId).isStreaming) return;

        const askedAt = Date.parse(active.startedAt) || Date.now();
        const userMessageId = nextMessageId();
        const aiMessageId = nextMessageId();
        update(projectId, () => ({
            messages: [
                ...history,
                { id: userMessageId, role: "user", content: active.userMessage, createdAt: new Date(askedAt).toISOString() },
                { id: aiMessageId, role: "assistant", content: "", isStreaming: true, startedAt: new Date(askedAt).toISOString() },
            ],
            isHistoryLoaded: true,
            historyError: null,
            hasUnsavedTurn: false,
            isStreaming: true,
            lastSentMessage: active.userMessage,
            streamingFiles: EMPTY_FILES,
            lastTurnFiles: [],
        }));

        const turn = beginTurn(projectId, aiMessageId, userMessageId, askedAt, active.userMessage);
        follow(turn, (handlers) => api.resumeChat(projectId, handlers), true);
    },

    sendMessage(projectId: string, content: string, teaching = false): boolean {
        if (getState(projectId).isStreaming) {
            update(projectId, () => ({ notice: STILL_WORKING_NOTICE }));
            return false;
        }
        writeFailedPrompt(projectId, null);

        const userMessageId = nextMessageId();
        const aiMessageId = nextMessageId();
        const askedAt = Date.now();

        update(projectId, (state) => ({
            messages: [
                ...state.messages,
                { id: userMessageId, role: "user", content, createdAt: new Date(askedAt).toISOString() },
                { id: aiMessageId, role: "assistant", content: "", isStreaming: true, startedAt: new Date(askedAt).toISOString(), teaching },
            ],
            isStreaming: true,
            lastSentMessage: content,
            streamingFiles: EMPTY_FILES,
            diffBaselines: EMPTY_FILES,
            lastTurnFiles: [],
            notice: null,
        }));

        const turn = beginTurn(projectId, aiMessageId, userMessageId, askedAt, content);
        follow(turn, (handlers) => api.streamChat(projectId, content, handlers, teaching), false);
        return true;
    },

    stopStreaming(projectId: string) {
        const turn = turnsInProgress.get(projectId);
        const cancel = cancelStreams.get(projectId);
        if (!turn && !cancel) return;
        if (turn) turn.stopped = true;
        cancelStreams.delete(projectId);
        turnsInProgress.delete(projectId);
        if (typeof cancel === "function") cancel();
        writeFailedPrompt(projectId, null);

        update(projectId, (state) => ({
            isStreaming: false,
            streamingFiles: EMPTY_FILES,
            ...(turn
                ? { completedFiles: turn.completedBefore, deletedFiles: turn.deletedBefore, lastTurnFiles: [], diffBaselines: EMPTY_FILES }
                : {}),
            messages: state.messages.map((message, index) =>
                index === state.messages.length - 1 && message.role === "assistant"
                    ? { ...message, isStreaming: false, wasStopped: true, status: undefined, createdAt: new Date().toISOString() }
                    : message
            ),
        }));

        api.stopGeneration(projectId).then(
            () => {
                void (turn ? adoptSavedTurn(turn) : projectChat.loadHistory(projectId));
            },
            (error) => console.error("Couldn't stop the response on the server:", error)
        );
    },

    retryLastMessage(projectId: string) {
        const { lastSentMessage, messages, isStreaming } = getState(projectId);
        const prompt = lastSentMessage ?? [...messages].reverse().find((message) => message.role === "user")?.content;
        if (!prompt || isStreaming) return;
        const wasTeaching = [...messages].reverse().find((message) => message.role === "assistant")?.teaching;
        void projectChat.sendMessage(projectId, prompt, !!wasTeaching);
    },

    filesChangedOutside(projectId: string, paths?: readonly string[]) {
        update(projectId, (state) => {
            if (state.isStreaming) return {};
            if (!paths) {
                return { completedFiles: EMPTY_FILES, deletedFiles: new Set<string>(), diffBaselines: EMPTY_FILES, lastTurnFiles: [] };
            }
            const completedFiles = new Map(state.completedFiles);
            const diffBaselines = new Map(state.diffBaselines);
            paths.forEach((path) => {
                completedFiles.delete(path);
                diffBaselines.delete(path);
            });
            return { completedFiles, diffBaselines, lastTurnFiles: state.lastTurnFiles.filter((path) => !paths.includes(path)) };
        });
    },

    async clearChat(projectId: string) {
        if (getState(projectId).isStreaming) throw new Error(STILL_WORKING_NOTICE);
        await api.clearChat(projectId);
        writeFailedPrompt(projectId, null);
        update(projectId, () => ({
            messages: [],
            lastSentMessage: null,
            hasUnsavedTurn: false,
            historyError: null,
            notice: null,
            suggestions: [],
            diffBaselines: EMPTY_FILES,
            lastTurnFiles: [],
        }));
    },

    dismissNotice(projectId: string) {
        if (getState(projectId).notice !== null) update(projectId, () => ({ notice: null }));
    },

    markDiffViewed(projectId: string, path: string) {
        const state = getState(projectId);
        if (!state.diffBaselines.has(path) || state.lastTurnFiles.includes(path)) return;
        update(projectId, (state) => {
            const diffBaselines = new Map(state.diffBaselines);
            diffBaselines.delete(path);
            return { diffBaselines };
        });
    },
};
