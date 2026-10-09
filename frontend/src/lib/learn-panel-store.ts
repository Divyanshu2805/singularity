/**
 * Whether the project's learning panel (the tour and the glossary) is open, and on what.
 *
 * Handles: opening the panel on the tour or on the glossary, opening it on one term - which asks for that term's
 * definition, since a press on a term is an explicit request - closing it, and exposing the state to components
 * through a subscription.
 *
 * It lives outside React because a term is pressed deep inside the chat, in a lesson or a big picture, while the panel
 * is drawn by the page: a store is how the one reaches the other without threading a handler through every card of the
 * chat. Nothing here is requested by opening the panel; only pressing a term, or asking inside the panel, spends the
 * person's allowance.
 *
 * The state names a project, and the panel shows only for the project it names. It is dropped on sign-out like every
 * other store's.
 */
import { useSyncExternalStore } from "react";
import { cleanTerm } from "./learn";
import { requestTerm } from "./lesson-store";
import { onSignOut } from "./session";

export type LearnTab = "tour" | "glossary";

export interface LearnPanelState {
  projectId: string | null;
  tab: LearnTab;
  term: string | null;
}

const CLOSED: LearnPanelState = { projectId: null, tab: "tour", term: null };

let state: LearnPanelState = CLOSED;
const listeners = new Set<() => void>();

function set(next: LearnPanelState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export const learnPanel = {
  state: (): LearnPanelState => state,

  open(projectId: string, tab: LearnTab = state.projectId === projectId ? state.tab : "tour") {
    set({ projectId, tab, term: tab === "glossary" && state.projectId === projectId ? state.term : null });
  },

  openTerm(projectId: string, term: string) {
    const clean = cleanTerm(term);
    if (!clean) return;
    requestTerm(projectId, clean);
    set({ projectId, tab: "glossary", term: clean });
  },

  selectTerm(term: string | null) {
    if (state.projectId) set({ ...state, term: term ? cleanTerm(term) : null });
  },

  setTab(tab: LearnTab) {
    if (state.projectId) set({ ...state, tab });
  },

  close() {
    set(CLOSED);
  },
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const read = () => state;

export function useLearnPanel(): LearnPanelState {
  return useSyncExternalStore(subscribe, read, read);
}

onSignOut(() => set(CLOSED));
