/**
 * The project build chat, per project, outside React so it survives switching tabs and panels.
 *
 * Handles: loading history, sending a message and streaming the answer, parsing files out of the stream as they are
 * written, reattaching to a generation already running on the server, stopping one, retrying an unfinished turn, and
 * exposing all of it to components through a subscription.
 *
 * Files still being written are kept here so opening one mid-response shows what has arrived, instead of asking the
 * server for a file it will not store until the turn finishes. They are cleared when the response ends: whatever is
 * left is a tag that never closed, so the backend has not saved it either.
 *
 * Server history replaces the live copy only once it has really caught up - a final assistant turn with no events
 * means the events did not save, and taking that copy would blank a response the reader is looking at.
 *
 * It registers its own reset with the session module: module state outlives a client-side route change, and not
 * clearing it once leaked one account's chat to the next person who signed in on the same browser.
 */
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
    streamingFilePath: string | null;
    streamingFiles: ReadonlyMap<string, string>;
    completedFiles: ReadonlyMap<string, string>;
    deletedFiles: ReadonlySet<string>;
    diffBaselines: ReadonlyMap<string, string>;
    lastTurnFiles: readonly string[];
    hasUnsavedTurn: boolean;
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

const states = new Map<string, ProjectChatState>();
const listeners = new Map<string, Set<() => void>>();
const latestTurnIds = new Map<string, number>();
const cancelStreams = new Map<string, () => void>();
const isAutoRetry = new Map<string, boolean>();
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
    isAutoRetry.clear();
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

const DELETED_FILE = /<delete\s+path="([^"]+)"[^>]*>[\s\S]*?<\/delete>/g;

interface FailedPrompt {
    content: string;
    error: string;
    failedAt: number;
    teachingMode: boolean;
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

const PLANNED_STEP = /<todo\s+path="([^"]+)"/g;

function unfinishedStepCount(content: string, writtenPaths: readonly string[]): number {
    const planned = [...content.matchAll(PLANNED_STEP)].map((match) => match[1]);
    if (planned.length === 0) return 0;
    const written = new Set(writtenPaths);
    return planned.filter((path) => !written.has(path)).length;
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

type StreamHandlers = {
    onChunk: (chunk: string) => void;
    onFile: (path: string, content: string, isComplete: boolean) => void;
    onComplete: () => void;
    onError: (error: Error) => void;
    onGone: () => void;
};

function followTurn(
    projectId: string,
    aiMessageId: string,
    askedAt: number,
    openStream: (handlers: StreamHandlers) => () => void,
    options: { teachingMode?: boolean },
    prompt: string,
    isResume = false
) {
    let awaitingBacklog = isResume;
    const turnId = (latestTurnIds.get(projectId) ?? 0) + 1;
    latestTurnIds.set(projectId, turnId);

    const turnFiles: string[] = [];
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
            if (unfinished > 0 && !isAutoRetry.get(projectId)) {
                projectChat.retryLastMessage(projectId, options);
            }
        },
        onError: (error) => {
            cancelStreams.delete(projectId);
            const notSent = error instanceof ApiRequestError;
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

    sendMessage(projectId: string, content: string, options: { teachingMode?: boolean; isRetry?: boolean } = {}) {
        if (getState(projectId).isStreaming) return;
        isAutoRetry.set(projectId, options.isRetry === true);
        writeFailedPrompt(projectId, null);

        const aiMessageId = nextMessageId();
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

    retryLastMessage(projectId: string, options: { teachingMode?: boolean } = {}) {
        const { lastSentMessage, isStreaming } = getState(projectId);
        if (!lastSentMessage || isStreaming) return;
        projectChat.sendMessage(projectId, lastSentMessage, { ...options, isRetry: true });
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
