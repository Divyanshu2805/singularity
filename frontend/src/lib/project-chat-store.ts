import { useCallback, useSyncExternalStore } from "react";
import type { ChatMessage } from "@/components/ChatPanel";
import { api, ApiRequestError, getUserInfo } from "./api";
import type { ActiveGeneration } from "./types";
import { onSignOut } from "./session";

export interface ProjectChatState {
    messages: ChatMessage[];
    isHistoryLoaded: boolean;
    historyError: string | null;
    isStreaming: boolean;
    /** The file the AI is writing right now - its content isn't complete yet. */
    streamingFilePath: string | null;
    /**
     * Content of files still being written, as far as it has arrived. Kept so opening one mid-response shows
     * what the AI has written so far instead of asking the server for a file it won't store until the whole
     * response finishes - which used to 404. Cleared when the response ends: whatever is left here is a
     * `<file>` tag that never closed, so the backend won't have saved it either.
     */
    streamingFiles: ReadonlyMap<string, string>;
    /** Final content of files the AI finished writing during this browser session. */
    completedFiles: ReadonlyMap<string, string>;
    /**
     * Files the AI deleted during this browser session (a rename removes the old copy). The server only applies the
     * delete once the turn is saved, so its file list still has these for a moment - the panel hides them meanwhile.
     */
    deletedFiles: ReadonlySet<string>;
    /**
     * Pre-edit content of files changed by the present chat. Kept until a newer turn replaces it (each
     * `sendMessage` starts this empty) or `markDiffViewed` explicitly drops one entry - the diff toggle in
     * `CodePanel` reads this on demand rather than clearing it just from being looked at.
     */
    diffBaselines: ReadonlyMap<string, string>;
    /** Files finished by the most recent response, in the order they were written. */
    lastTurnFiles: readonly string[];
    /** A finished response the backend may still be saving, so reloading history mustn't drop it. */
    hasUnsavedTurn: boolean;
    /** The message that started the response now running (or the last one to run), so it can be sent again. */
    lastSentMessage: string | null;
}

const EMPTY_FILES: ReadonlyMap<string, string> = new Map();

const INITIAL_STATE: ProjectChatState = {
    messages: [],
    isHistoryLoaded: false,
    historyError: null,
    isStreaming: false,
    streamingFilePath: null,
    streamingFiles: EMPTY_FILES,
    completedFiles: EMPTY_FILES,
    deletedFiles: new Set<string>(),
    diffBaselines: EMPTY_FILES,
    lastTurnFiles: [],
    hasUnsavedTurn: false,
    lastSentMessage: null,
};

// Lives outside React on purpose: a response keeps streaming into here while the user is on
// another page, so coming back to the project shows exactly where it is instead of an empty chat.
const states = new Map<string, ProjectChatState>();
const listeners = new Map<string, Set<() => void>>();
const latestTurnIds = new Map<string, number>();
/** Aborts the response in flight, so it can be stopped from the composer. */
const cancelStreams = new Map<string, () => void>();
/** Whether the turn now running is itself an automatic retry - one is allowed, never a chain of them. */
const isAutoRetry = new Map<string, boolean>();
let lastMessageId = Date.now();

/**
 * The last turn's diffs, kept across a reload.
 *
 * <p>A baseline is a file as it was *before* the AI rewrote it, captured while the response streams. Nothing
 * on the server has that version - storage only holds the current one - so once this map is gone the diff for
 * the turn the user is looking at can never be rebuilt. Keeping it in memory alone meant a refresh silently
 * took the diff toggle away from the very turn they had just watched happen.
 *
 * <p>`sessionStorage` rather than `localStorage`: a diff is about the turn in front of you, so it should end
 * with the tab rather than resurface days later against a file that has moved on since.
 */
const baselineKey = (projectId: string) => `diff_baselines_${projectId}`;

/** Whole file contents, so this is capped - losing a diff beats blowing the storage quota for the whole app. */
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
        // Private windows, cleared site data, or something else's malformed value - a missing diff is survivable.
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
        // Out of quota or storage blocked: the in-memory diff still works for this page's lifetime.
    }
}

function getState(projectId: string): ProjectChatState {
    let state = states.get(projectId);
    if (!state) {
        // Cached straight away so this stays a stable snapshot for `useSyncExternalStore`.
        state = { ...INITIAL_STATE, ...readStoredBaselines(projectId) };
        states.set(projectId, state);
    }
    return state;
}

function update(projectId: string, change: (state: ProjectChatState) => Partial<ProjectChatState>) {
    const current = getState(projectId);
    const next = { ...current, ...change(current) };
    states.set(projectId, next);
    // The one mutation point, so the one place the diff needs writing through to survive a reload.
    if (next.diffBaselines !== current.diffBaselines || next.lastTurnFiles !== current.lastTurnFiles) {
        writeStoredBaselines(projectId, next);
    }
    listeners.get(projectId)?.forEach((listener) => listener());
}

/**
 * A project's transcript, the files a turn wrote and its diff baselines all belong to whoever was signed in.
 * This map lives for the life of the page rather than the route, so without this a sign-out followed by a
 * sign-in on the same browser showed the next account the previous one's chat - `loadHistory`'s `hasCaughtUp`
 * guard would even refuse to replace it with the server's (correct, empty) answer, since the in-memory copy
 * had more turns. Any response still streaming is aborted first: it was started by the account that left.
 */
onSignOut(() => {
    cancelStreams.forEach((cancel) => {
        try {
            cancel();
        } catch {
            // Already finished or aborted - nothing left to stop.
        }
    });
    cancelStreams.clear();
    isAutoRetry.clear();
    latestTurnIds.clear();

    const projectIds = [...states.keys()];
    states.clear();
    // Anything still mounted re-reads an empty store rather than keeping the last render on screen.
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

/** Every fully arrived `<delete path="...">...</delete>` in a response. */
const DELETED_FILE = /<delete\s+path="([^"]+)"[^>]*>[\s\S]*?<\/delete>/g;

/**
 * A message whose response failed - most often refused outright (out of quota, a response already running) - kept so
 * a refresh doesn't lose it. Nothing about a turn is saved server-side until its response finishes, so without this
 * the question simply vanished: someone who ran out of quota, upgraded and came back found an empty chat.
 *
 * <p>`localStorage`, not `sessionStorage`: upgrading goes out to Stripe and back, often in a new tab. Keyed by user as
 * well as project, and cleared at sign-out (see `session.ts`), since it's that person's words.
 */
interface FailedPrompt {
    content: string;
    error: string;
    failedAt: number;
    teachingMode: boolean;
    /** Refused before any response started, as opposed to failing part-way. */
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
        // Storage blocked or full: the failure still shows until the page is left, just not after a refresh.
    }
}

/** Every `<todo path="...">` the response planned - the checklist it committed to at the start of the turn. */
const PLANNED_STEP = /<todo\s+path="([^"]+)"/g;

/**
 * How many files the answer said it would write but never did.
 *
 * <p>A turn that runs out of output budget ends *cleanly* - no error, just a stream that stops - so this is
 * the only signal on the client that a build was cut short. The backend writes its own explanation into the
 * transcript; this is what makes Retry appear and what triggers the single automatic attempt.
 */
function unfinishedStepCount(content: string, writtenPaths: readonly string[]): number {
    const planned = [...content.matchAll(PLANNED_STEP)].map((match) => match[1]);
    if (planned.length === 0) return 0;
    const written = new Set(writtenPaths);
    return planned.filter((path) => !written.has(path)).length;
}

const updateMessage = (messages: ChatMessage[], id: string, change: (message: ChatMessage) => Partial<ChatMessage>) =>
    messages.map((message) => (message.id === id ? { ...message, ...change(message) } : message));

/**
 * Whether the server's history has really caught up with a turn that just finished, and is therefore safe to
 * swap in over the live copy.
 *
 * <p>Fewer messages means it is still saving. The same count but a final assistant turn carrying no events
 * means the *events* didn't save even though the message row did - taking that copy would replace a response
 * the user is reading with the backend's `"Assistant Message here..."` placeholder, which is what "the chat
 * gets deleted when a new message is added" looked like. Keeping the live copy leaves the turn readable until
 * a reload, rather than blanking it the moment anything else triggers a history refresh.
 */
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
    }));

/**
 * Whether the history already holds the turn a generation belongs to - it finished and saved in the moment between
 * asking the server what's running and reading the history. Reattaching then would show the same turn twice.
 */
function historyHasTurn(messages: ChatMessage[], active: ActiveGeneration) {
    const last = messages[messages.length - 1];
    const question = messages[messages.length - 2];
    if (!last || !question || last.role !== "assistant" || question.role !== "user") return false;
    if (question.content !== active.userMessage || !last.events?.length) return false;
    const savedAt = Date.parse(question.createdAt ?? "");
    // A generous margin for clock skew: the same question asked again an hour later is a different turn.
    return Number.isFinite(savedAt) && savedAt >= Date.parse(active.startedAt) - 60_000;
}

/** Whether a message remembered as failed is in fact in the saved history, sent at or after the time it failed. */
function historyHasPrompt(messages: ChatMessage[], failed: FailedPrompt) {
    return messages.some((message) => {
        if (message.role !== "user" || message.content !== failed.content) return false;
        const savedAt = Date.parse(message.createdAt ?? "");
        return Number.isFinite(savedAt) && savedAt >= failed.failedAt - 60_000;
    });
}

/** The failed message and its error, as they looked before the refresh - so Edit and Retry are right there again. */
function restoredFailedTurn(failed: FailedPrompt): ChatMessage[] {
    const at = new Date(failed.failedAt).toISOString();
    return [
        { id: nextMessageId(), role: "user", content: failed.content, createdAt: at },
        { id: nextMessageId(), role: "assistant", content: "", createdAt: at, error: failed.error, notSent: failed.notSent },
    ];
}

type StreamHandlers = {
    onChunk: (chunk: string) => void;
    onFile: (path: string, content: string, isComplete: boolean) => void;
    onComplete: () => void;
    onError: (error: Error) => void;
    onGone: () => void;
};

/**
 * Follows one response into the store, whether this page started it or is reattaching to it after a refresh. The
 * two only differ in how the stream is opened; everything it writes into the chat is the same.
 */
function followTurn(
    projectId: string,
    aiMessageId: string,
    askedAt: number,
    openStream: (handlers: StreamHandlers) => () => void,
    options: { teachingMode?: boolean },
    /** The message this response answers - remembered if the response fails, so a refresh can offer it again. */
    prompt: string,
    /** Reattaching after a refresh: the first chunk is the backlog, and is shown at once rather than retyped. */
    isResume = false
) {
    let awaitingBacklog = isResume;
    const turnId = (latestTurnIds.get(projectId) ?? 0) + 1;
    latestTurnIds.set(projectId, turnId);

    const turnFiles: string[] = [];
    // Fetched when each file starts streaming. The backend saves nothing until the whole response ends,
    // so this is still the pre-edit version; a file that doesn't exist yet diffs against an empty baseline.
    const baselines = new Map<string, Promise<string>>();
    const captureBaseline = (path: string) => {
        let baseline = baselines.get(path);
        if (!baseline) {
            baseline = api.getFileContent(projectId, path).catch(() => "");
            baselines.set(path, baseline);
        }
        return baseline;
    };

    const deletedThisTurn = new Set<string>();

    const cancel = openStream({
        onChunk: (chunk) => {
            const isBacklog = awaitingBacklog;
            awaitingBacklog = false;
            update(projectId, (state) => ({
                messages: updateMessage(state.messages, aiMessageId, (message) => ({
                    content: message.content + chunk,
                    ...(isBacklog ? { instantLength: message.content.length + chunk.length } : {}),
                })),
            }));

            const answer = getState(projectId).messages.find((message) => message.id === aiMessageId)?.content ?? "";
            const newlyDeleted = [...answer.matchAll(DELETED_FILE)].map((match) => match[1]).filter((path) => !deletedThisTurn.has(path));
            if (newlyDeleted.length > 0) {
                newlyDeleted.forEach((path) => deletedThisTurn.add(path));
                update(projectId, (state) => {
                    const deletedFiles = new Set(state.deletedFiles);
                    const completedFiles = new Map(state.completedFiles);
                    const streamingFiles = new Map(state.streamingFiles);
                    newlyDeleted.forEach((path) => {
                        deletedFiles.add(path);
                        completedFiles.delete(path);
                        streamingFiles.delete(path);
                    });
                    return { deletedFiles, completedFiles, streamingFiles };
                });
            }
        },
        onFile: (path, fileContent, isComplete) => {
            if (!isComplete) {
                captureBaseline(path);
                update(projectId, (state) => ({
                    streamingFilePath: path,
                    streamingFiles: new Map(state.streamingFiles).set(path, fileContent),
                }));
                return;
            }

            if (!turnFiles.includes(path)) turnFiles.push(path);
            const baseline = captureBaseline(path);
            update(projectId, (state) => {
                const streamingFiles = new Map(state.streamingFiles);
                streamingFiles.delete(path);
                // Written again after an earlier delete: it exists once more.
                const deletedFiles = new Set(state.deletedFiles);
                deletedFiles.delete(path);
                return {
                    deletedFiles,
                    completedFiles: new Map(state.completedFiles).set(path, fileContent),
                    streamingFiles,
                    streamingFilePath: state.streamingFilePath === path ? null : state.streamingFilePath,
                    lastTurnFiles: [...turnFiles],
                    messages: updateMessage(state.messages, aiMessageId, () => ({ editedFiles: [...turnFiles] })),
                };
            });
            baseline.then((original) => {
                if (latestTurnIds.get(projectId) !== turnId) return;
                update(projectId, (state) => ({ diffBaselines: new Map(state.diffBaselines).set(path, original) }));
            });
        },
        onComplete: () => {
            cancelStreams.delete(projectId);
            let unfinished = 0;
            update(projectId, (state) => {
                const answer = state.messages.find((message) => message.id === aiMessageId);
                unfinished = unfinishedStepCount(answer?.content ?? "", turnFiles);
                return {
                    isStreaming: false,
                    streamingFilePath: null,
                    // Anything still in here is a <file> the model never closed, so it was never saved either.
                    streamingFiles: EMPTY_FILES,
                    hasUnsavedTurn: true,
                    messages: updateMessage(state.messages, aiMessageId, () => ({
                        isStreaming: false,
                        createdAt: new Date().toISOString(),
                        thoughtSeconds: Math.round((Date.now() - askedAt) / 1000),
                        unfinishedSteps: unfinished,
                    })),
                };
            });
            writeFailedPrompt(projectId, null);
            // One automatic go at finishing a build that stopped mid-plan; after that it's the reader's call,
            // since each attempt is a full generation they're paying for.
            if (unfinished > 0 && !isAutoRetry.get(projectId)) {
                projectChat.retryLastMessage(projectId, options);
            }
        },
        onError: (error) => {
            cancelStreams.delete(projectId);
            const notSent = error instanceof ApiRequestError;
            // A rejected session has already signed out and cleared this person's storage - don't write it back.
            if (!(error instanceof ApiRequestError && error.status === 401)) {
                writeFailedPrompt(projectId, {
                    content: prompt,
                    error: error.message || "Something went wrong",
                    failedAt: Date.now(),
                    teachingMode: options.teachingMode === true,
                    notSent,
                });
            }
            update(projectId, (state) => ({
                isStreaming: false,
                streamingFilePath: null,
                // A half-written file from a failed response isn't real content - fall back to the server's copy.
                streamingFiles: EMPTY_FILES,
                messages: updateMessage(state.messages, aiMessageId, () => ({
                    isStreaming: false,
                    createdAt: new Date().toISOString(),
                    error: error.message || "Something went wrong",
                    notSent,
                })),
            }));
        },
        onGone: () => {
            // Finished and saved in the moment between checking and attaching: the history has it now.
            cancelStreams.delete(projectId);
            update(projectId, () => ({ isStreaming: false, streamingFilePath: null, streamingFiles: EMPTY_FILES }));
            void projectChat.loadHistory(projectId);
        },
    });

    cancelStreams.set(projectId, cancel);
}

export function useProjectChat(projectId: string): ProjectChatState {
    const subscribeToProject = useCallback((listener: () => void) => subscribe(projectId, listener), [projectId]);
    const getProjectState = useCallback(() => getState(projectId), [projectId]);
    return useSyncExternalStore(subscribeToProject, getProjectState);
}

/**
 * Rebuilds the last turn's diffs from the server when this page has none - after signing out and back in (which
 * clears `sessionStorage`), in a new tab, or on another device. The browser's own copy wins when it has one: it can be
 * newer than the server's, for a turn that has finished streaming but isn't saved yet.
 */
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
        // No diff is a lesser loss than a broken chat - the history itself has already loaded.
    }
}

export const projectChat = {
    /**
     * Loads the saved transcript - and, if a response is still being generated for it (the page was refreshed or
     * reopened mid-answer), puts that question back on screen and reattaches to the answer where it has got to.
     * Generation runs server-side independently of any page, so nothing is lost by leaving.
     */
    async loadHistory(projectId: string) {
        if (getState(projectId).isStreaming) {
            update(projectId, () => ({ isHistoryLoaded: true }));
            return;
        }
        try {
            // Asked before the history is read, so a response that finishes in between is already in that history
            // (the server only forgets a generation once its turn is saved) - see `historyHasTurn` for the overlap.
            const active = await api.getActiveGeneration(projectId).catch(() => null);
            const messages = toChatMessages(await api.getChatHistory(projectId));

            if (active && !getState(projectId).isStreaming && !historyHasTurn(messages, active)) {
                projectChat.resumeGeneration(projectId, messages, active);
                return;
            }

            const failed = active ? null : readFailedPrompt(projectId);
            if (failed && historyHasPrompt(messages, failed)) {
                // It went through after all (the network dropped, but the server finished and saved the turn).
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
                // Right after a response finishes the backend may still be saving it - keep the live copy until it catches up.
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

    /** Shows a response that's still being generated on the server and follows it to the end. */
    resumeGeneration(projectId: string, history: ChatMessage[], active: ActiveGeneration) {
        if (getState(projectId).isStreaming) return;
        // A resumed turn may itself have been an automatic retry; allowing one more is the safe side of not knowing.
        isAutoRetry.set(projectId, false);

        const askedAt = Date.parse(active.startedAt) || Date.now();
        const aiMessageId = nextMessageId();
        update(projectId, () => ({
            messages: [
                ...history,
                { id: nextMessageId(), role: "user", content: active.userMessage, createdAt: new Date(askedAt).toISOString() },
                { id: aiMessageId, role: "assistant", content: "", isStreaming: true, editedFiles: [] },
            ],
            isHistoryLoaded: true,
            historyError: null,
            hasUnsavedTurn: false,
            isStreaming: true,
            lastSentMessage: active.userMessage,
            streamingFilePath: null,
            streamingFiles: EMPTY_FILES,
            // Baselines captured before the refresh are for this very turn, restored from sessionStorage - kept.
            lastTurnFiles: [],
        }));

        followTurn(
            projectId,
            aiMessageId,
            askedAt,
            ({ onChunk, onFile, onComplete, onError, onGone }) =>
                api.resumeChat(projectId, onChunk, onFile, onComplete, onError, onGone),
            { teachingMode: active.teachingMode },
            active.userMessage,
            true
        );
    },

    /**
     * `teachingMode` is decided per message, so turning it on or off never changes a response already underway.
     *
     * <p>`isRetry` marks a send that is picking up an answer which stopped early, so one automatic retry can't
     * turn into a chain of them.
     */
    sendMessage(projectId: string, content: string, options: { teachingMode?: boolean; isRetry?: boolean } = {}) {
        if (getState(projectId).isStreaming) return;
        isAutoRetry.set(projectId, options.isRetry === true);
        // Sending again (or anything new) supersedes an earlier failed message.
        writeFailedPrompt(projectId, null);

        const aiMessageId = nextMessageId();
        // The server stamps its own times and writes a "Worked for" event, but only once the whole turn is
        // saved - so the browser keeps its own until then, instead of the time appearing on the next refresh.
        const askedAt = Date.now();

        update(projectId, (state) => ({
            messages: [
                ...state.messages,
                { id: nextMessageId(), role: "user", content, createdAt: new Date(askedAt).toISOString() },
                { id: aiMessageId, role: "assistant", content: "", isStreaming: true, editedFiles: [] },
            ],
            isStreaming: true,
            lastSentMessage: content,
            streamingFilePath: null,
            streamingFiles: EMPTY_FILES,
            // Diffs are about the present chat only; anything unseen from an older response falls back to full content.
            diffBaselines: EMPTY_FILES,
            lastTurnFiles: [],
        }));

        followTurn(
            projectId,
            aiMessageId,
            askedAt,
            ({ onChunk, onFile, onComplete, onError }) =>
                api.streamChat(projectId, content, onChunk, onFile, onComplete, onError, { teachingMode: options.teachingMode === true }),
            options,
            content
        );
    },

    /**
     * Stops the response in flight. Whatever has already arrived stays on screen and the files the model
     * finished writing are kept - the backend never saw the end of the turn, so nothing is persisted, which is
     * why the message says the answer was stopped rather than pretending it finished.
     *
     * <p>Closing the stream is no longer enough on its own: the response runs server-side so it survives a
     * refresh, which means it has to be told to stop.
     */
    stopStreaming(projectId: string) {
        const cancel = cancelStreams.get(projectId);
        if (!cancel) return;
        cancelStreams.delete(projectId);
        cancel();
        writeFailedPrompt(projectId, null);
        api.stopGeneration(projectId).catch((error) => console.error("Couldn't stop the response on the server:", error));

        update(projectId, (state) => ({
            isStreaming: false,
            streamingFilePath: null,
            streamingFiles: EMPTY_FILES,
            messages: state.messages.map((message, index) =>
                index === state.messages.length - 1 && message.role === "assistant"
                    ? { ...message, isStreaming: false, wasStopped: true, createdAt: new Date().toISOString() }
                    : message
            ),
        }));
    },

    /** Sends the last message again - for a turn that was stopped, failed, or ran out of room mid-plan. */
    retryLastMessage(projectId: string, options: { teachingMode?: boolean } = {}) {
        const { lastSentMessage, isStreaming } = getState(projectId);
        if (!lastSentMessage || isStreaming) return;
        projectChat.sendMessage(projectId, lastSentMessage, { ...options, isRetry: true });
    },

    /**
     * Drops a file's stored baseline outright, so it can no longer be diffed at all - used when a chat
     * reference points at an older turn's mention of the file, where showing "changes" would mean the
     * wrong turn's edit. Not called just for switching tabs or hiding the diff toggle; those are local,
     * reversible UI state in `CodePanel` and leave this map alone.
     *
     * <p>A file the latest turn actually wrote is never dropped: its diff is the one the user asked to
     * always be there, and an older message happening to mention the same file mustn't take it away.
     */
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
