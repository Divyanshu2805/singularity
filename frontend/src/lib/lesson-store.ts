/**
 * What teaching mode writes - a step's lesson, a turn's big picture, and what it keeps for the whole project - outside
 * React so one opened in the chat survives a remount.
 *
 * Handles: asking for a step's lesson once - when the person opens it - and for a turn's big picture once, streaming
 * the answer into place, remembering it for the rest of the tab session, exposing each to components through a
 * subscription, and counting how many of a turn's lessons have been written in this tab.
 *
 * A lesson is requested, never generated with the build: the build chat writes no explanation, so teaching mode costs
 * nothing until a step is opened. It is asked for by the id of the file edit the turn saved, and nothing else: the
 * server reads the change from the saved conversation, so the lesson is about what that step changed rather than
 * about the whole file as the browser happens to hold it. The server also keeps the finished lesson on the step and
 * sends it back with the conversation, so this store only has to hold one that is being written, or was written, in
 * this tab; it used to keep them in session storage, which a new tab or another device never saw.
 *
 * Nothing is requested by pointing at a step any more. The toggle is a small icon beside every step's name, where
 * the pointer passes all the time, and each request spends the person's allowance.
 *
 * The big picture is asked for the same way, by the id of the saved reply and nothing else, when its row is opened.
 * It opened by itself on a turn that had just finished, for one afternoon; the owner asked for it to stay folded
 * until pressed, so nothing here is requested without a press.
 *
 * The project-wide writings go through the same door and are asked for only by a press: the tour of the whole
 * project (and, when its reader asks, a new one over the kept one), a glossary term's definition, a step's "try
 * changing this" task, and the check of that task. The server keeps the first three and returns the kept text for
 * nothing when asked again, so a request is safe to repeat; a check is the one that is asked again on purpose, since
 * the file may have changed since it last said "Not yet".
 *
 * Each request carries the reader's level (lib/learner-level.ts) as it stands when it is made.
 *
 * The in-memory map is reset on sign-out for the same reason the other stores are.
 */
import { useCallback, useSyncExternalStore } from "react";
import { api, type CodeInsightKind } from "./api";
import { getLearnerLevel } from "./learner-level";
import { cleanTerm, termKey } from "./learn";
import { onSignOut } from "./session";

export interface LessonState {
  status: "loading" | "done" | "error";
  text: string;
  error?: string;
}

const states = new Map<string, LessonState>();
const listeners = new Set<() => void>();

export const lessonKey = (projectId: string, eventId: number) => `${projectId}:${eventId}`;

const emit = () => listeners.forEach((listener) => listener());

function set(key: string, state: LessonState) {
  states.set(key, state);
  emit();
}

export const overviewKey = (projectId: string, turnId: number) => `${projectId}:turn:${turnId}`;

export const tourKey = (projectId: string) => `${projectId}:tour`;
export const termStateKey = (projectId: string, term: string) => `${projectId}:term:${termKey(term)}`;
export const taskKey = (projectId: string, eventId: number) => `${projectId}:task:${eventId}`;
export const taskCheckKey = (projectId: string, eventId: number) => `${projectId}:task-check:${eventId}`;

export function requestLesson(projectId: string, eventId: number) {
  return request(projectId, lessonKey(projectId, eventId), "lesson", { eventId });
}

export function requestOverview(projectId: string, turnId: number) {
  return request(projectId, overviewKey(projectId, turnId), "overview", { messageId: turnId });
}

export function requestTour(projectId: string, rewrite = false) {
  return request(projectId, tourKey(projectId), "tour", { rewrite }, rewrite);
}

export function requestTerm(projectId: string, term: string) {
  return request(projectId, termStateKey(projectId, term), "glossary", { term: cleanTerm(term) });
}

export function requestTask(projectId: string, eventId: number) {
  return request(projectId, taskKey(projectId, eventId), "task", { eventId });
}

export function requestTaskCheck(projectId: string, eventId: number) {
  return request(projectId, taskCheckKey(projectId, eventId), "task-check", { eventId }, true);
}

export function forget(key: string) {
  if (states.get(key)?.status === "loading") return;
  states.delete(key);
  emit();
}

function request(projectId: string, key: string, kind: CodeInsightKind, body: Record<string, unknown>, again = false) {
  const known = states.get(key);
  if (known?.status === "loading") return key;
  if (known && known.status !== "error" && !again) return key;

  set(key, { status: "loading", text: "" });
  let text = "";
  api.streamCodeInsight(
    projectId,
    kind,
    { ...body, level: getLearnerLevel() },
    (chunk) => {
      text += chunk;
      set(key, { status: "loading", text });
    },
    () => {
      if (!text.trim()) {
        set(key, { status: "error", text: "", error: "The AI didn't write anything. Try again." });
        return;
      }
      set(key, { status: "done", text });
    },
    (error) => set(key, { status: "error", text, error: error.message })
  );
  return key;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useLesson(key: string | null): LessonState | undefined {
  const read = useCallback(() => (key ? states.get(key) : undefined), [key]);
  return useSyncExternalStore(subscribe, read, read);
}

export function useLessonsWritten(projectId: string, eventIds: string): number {
  const read = useCallback(
    () => eventIds.split(",").filter((eventId) => eventId && states.get(`${projectId}:${eventId}`)?.status === "done").length,
    [projectId, eventIds]
  );
  return useSyncExternalStore(subscribe, read, read);
}

onSignOut(() => {
  states.clear();
  emit();
});
