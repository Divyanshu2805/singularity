/**
 * The lessons teaching mode writes about a build step, outside React so one opened in the chat survives a remount.
 *
 * Handles: asking for a step's lesson once - when the person opens it - streaming the answer into place, remembering
 * it for the rest of the tab session, and exposing each to components through a subscription.
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
 * The in-memory map is reset on sign-out for the same reason the other stores are.
 */
import { useCallback, useSyncExternalStore } from "react";
import { api } from "./api";
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

export function requestLesson(projectId: string, eventId: number) {
  const key = lessonKey(projectId, eventId);
  const known = states.get(key);
  if (known && known.status !== "error") return key;

  set(key, { status: "loading", text: "" });
  let text = "";
  api.streamCodeInsight(
    projectId,
    "lesson",
    { eventId },
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

onSignOut(() => {
  states.clear();
  emit();
});
