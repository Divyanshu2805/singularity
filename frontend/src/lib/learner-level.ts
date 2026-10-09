/**
 * How much code the person says they know, which every explanation is written for.
 *
 * Handles: the three levels and their labels, reading and keeping the choice in this browser under the signed-in
 * person's id, and exposing it to components through a subscription.
 *
 * It is a preference, not a record: the server never stores it, and each request for a lesson, a big picture or an
 * ExplainLLM answer carries the level in force when it was asked. A lesson or big picture is written once and kept,
 * so changing the level changes what is written from then on, not what was already written.
 *
 * Kept in local storage under the person's own id so it is still there next week, and so a second account on the
 * same browser has its own. The copy in memory is dropped on sign-out like every other store's.
 */
import { useSyncExternalStore } from "react";
import { getUserInfo } from "./api";
import { onSignOut } from "./session";

export type LearnerLevel = "NEW" | "SOME" | "DEVELOPER";

export const LEARNER_LEVELS: { value: LearnerLevel; label: string; hint: string }[] = [
  { value: "NEW", label: "New to code", hint: "Everyday words, every term explained." },
  { value: "SOME", label: "I've coded a little", hint: "Skips the basics, explains React and TypeScript." },
  { value: "DEVELOPER", label: "I'm a developer", hint: "Brisk: decisions, trade-offs and how it connects." },
];

const KEY_PREFIX = "learner_level_";
const DEFAULT_LEVEL: LearnerLevel = "NEW";

const listeners = new Set<() => void>();
let cached: LearnerLevel | null = null;

const isLevel = (value: unknown): value is LearnerLevel =>
  LEARNER_LEVELS.some((level) => level.value === value);

const storageKey = () => `${KEY_PREFIX}${getUserInfo()?.id ?? "anon"}`;

export function getLearnerLevel(): LearnerLevel {
  if (cached) return cached;
  try {
    const stored = localStorage.getItem(storageKey());
    cached = isLevel(stored) ? stored : DEFAULT_LEVEL;
  } catch {
    cached = DEFAULT_LEVEL;
  }
  return cached;
}

export function setLearnerLevel(level: LearnerLevel) {
  cached = level;
  try {
    localStorage.setItem(storageKey(), level);
  } catch {
  }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

onSignOut(() => {
  cached = null;
  listeners.forEach((listener) => listener());
});

export function useLearnerLevel() {
  return [useSyncExternalStore(subscribe, getLearnerLevel, getLearnerLevel), setLearnerLevel] as const;
}
