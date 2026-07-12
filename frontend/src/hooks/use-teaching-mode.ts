import { useSyncExternalStore } from "react";
import { onSignOut } from "@/lib/session";

const listeners = new Set<() => void>();

/**
 * Off at the start of every session, on purpose.
 *
 * <p>It used to be remembered in localStorage, which meant a learner who switched it on once found it still
 * on days later - and since walkthroughs roughly double the output of every build, that's a slow, expensive
 * surprise rather than a helpful default. It's now kept in memory for the session: turn it on when you want
 * to be taught, and a reload starts clean.
 */
let enabled = false;

const read = () => enabled;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const setTeachingMode = (next: boolean) => {
  enabled = next;
  listeners.forEach((listener) => listener());
};

/** A learner's setting, so the next person to sign in on this browser starts from the default again. */
onSignOut(() => setTeachingMode(false));

/**
 * Whether the AI explains the concept behind each file as it builds. A learner's setting rather than a
 * project's, so one choice covers every project for as long as the tab is open. It's sent with each message;
 * the server keeps nothing, and lessons already in a chat stay visible either way.
 */
export function useTeachingMode() {
  return [useSyncExternalStore(subscribe, read), setTeachingMode] as const;
}
