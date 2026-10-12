/**
 * How the code editor looks to this person: the size of its text, and whether long lines wrap.
 *
 * Handles: the choices and their labels, reading and keeping them in this browser, tolerating anything unexpected in
 * storage by falling back to the defaults, and exposing them to components through a subscription so an open editor
 * changes the moment the Settings page does.
 *
 * It is about a screen and a pair of eyes, not about an account or a project, so it is kept per browser and is not
 * cleared on sign-out - the same reasoning as the files column's being open or shut. The defaults are what the editor
 * did before there was a choice: 13.5px, wrapped.
 */
import { useSyncExternalStore } from "react";

export type EditorTextSize = "SMALL" | "MEDIUM" | "LARGE";

export interface EditorPreferences {
  textSize: EditorTextSize;
  wrapLines: boolean;
}

export const EDITOR_TEXT_SIZES: { value: EditorTextSize; label: string; px: number }[] = [
  { value: "SMALL", label: "Small", px: 12.5 },
  { value: "MEDIUM", label: "Medium", px: 13.5 },
  { value: "LARGE", label: "Large", px: 15 },
];

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = { textSize: "MEDIUM", wrapLines: true };

const KEY = "editor_preferences";
const listeners = new Set<() => void>();
let cached: EditorPreferences | null = null;

export const editorTextPx = (size: EditorTextSize) =>
  (EDITOR_TEXT_SIZES.find((option) => option.value === size) ?? EDITOR_TEXT_SIZES[1]).px;

/** Whatever was stored, made into preferences: an unknown size or a missing field takes its default. */
export function parseEditorPreferences(raw: string | null): EditorPreferences {
  if (!raw) return DEFAULT_EDITOR_PREFERENCES;
  try {
    const stored = JSON.parse(raw) as Partial<EditorPreferences> | null;
    if (!stored || typeof stored !== "object") return DEFAULT_EDITOR_PREFERENCES;
    return {
      textSize: EDITOR_TEXT_SIZES.some((option) => option.value === stored.textSize)
        ? (stored.textSize as EditorTextSize)
        : DEFAULT_EDITOR_PREFERENCES.textSize,
      wrapLines: typeof stored.wrapLines === "boolean" ? stored.wrapLines : DEFAULT_EDITOR_PREFERENCES.wrapLines,
    };
  } catch {
    return DEFAULT_EDITOR_PREFERENCES;
  }
}

export function getEditorPreferences(): EditorPreferences {
  if (cached) return cached;
  try {
    cached = parseEditorPreferences(localStorage.getItem(KEY));
  } catch {
    cached = DEFAULT_EDITOR_PREFERENCES;
  }
  return cached;
}

export function setEditorPreferences(change: Partial<EditorPreferences>) {
  cached = { ...getEditorPreferences(), ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
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

export function useEditorPreferences() {
  return [useSyncExternalStore(subscribe, getEditorPreferences, getEditorPreferences), setEditorPreferences] as const;
}
