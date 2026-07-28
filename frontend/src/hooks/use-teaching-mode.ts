/**
 * Whether the next build turn should explain itself as it goes.
 *
 * Handles: the in-memory toggle and its subscription, cleared on sign-out.
 *
 * Off at the start of every session on purpose. It used to be remembered in browser storage, so a learner who
 * switched it on once found it still on days later - and since walkthroughs roughly double the output of every build,
 * that is a slow, expensive surprise rather than a helpful default.
 */
import { useSyncExternalStore } from "react";
import { onSignOut } from "@/lib/session";

const listeners = new Set<() => void>();

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

onSignOut(() => setTeachingMode(false));

export function useTeachingMode() {
  return [useSyncExternalStore(subscribe, read), setTeachingMode] as const;
}
