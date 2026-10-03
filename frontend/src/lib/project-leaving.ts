/**
 * Which project, if any, has just been deleted and is still fading out of the lists.
 *
 * Handles: holding that one id for the moment the fade takes, and exposing it to components through a subscription.
 *
 * It lives outside React because a project can be deleted from one place and shown in another: the sidebar and the
 * page each call useProjectActions, so a delete made from the sidebar's menu has to reach the card on the page.
 * Kept in the hook's own state it reached only the lists that hook's caller renders, and the card vanished instead.
 *
 * It registers its own reset with the session module, as every module-level store holding project state must - a
 * client-side route change after signing out does not clear module state on its own.
 */
import { useSyncExternalStore } from "react";
import { onSignOut } from "./session";

let leavingId: number | null = null;
const listeners = new Set<() => void>();

function set(id: number | null) {
  if (leavingId === id) return;
  leavingId = id;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const markProjectLeaving = (id: number) => set(id);

export const clearProjectLeaving = () => set(null);

export const getLeavingProjectId = () => leavingId;

export const useLeavingProjectId = () => useSyncExternalStore(subscribe, getLeavingProjectId);

onSignOut(clearProjectLeaving);
