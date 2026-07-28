/**
 * Everything the browser is holding on behalf of the person currently signed in, and how to let go of it.
 *
 * Handles: the registry a store adds its own reset to, clearing all of them, and leaving for the sign-in page through
 * a full document load.
 *
 * This exists because signing out used to be a client-side route change. Module-level state lives for the life of the
 * page, not the route, so the chat and notes stores kept their maps intact across it, and the next account to sign in
 * on that browser opened a project and read the previous one's transcript with no request ever having been made for
 * it. Browser storage behaved the same way and survives a reload too.
 *
 * Both guards are needed: the registry can be forgotten by a new store, and a reload alone does not clear session
 * storage. Any new module-level store holding project or user state must register here.
 */
const resetters = new Set<() => void>();

export function onSignOut(reset: () => void) {
  resetters.add(reset);
}

const PROJECT_LOCAL_KEY_PREFIXES = ["open_tabs", "active_tab", "failed_prompt"];

export function clearSignedInState() {
  for (const reset of resetters) {
    try {
      reset();
    } catch {
    }
  }

  try {
    sessionStorage.clear();
  } catch {
  }

  try {
    const stale = Object.keys(localStorage)
      .filter((key) => PROJECT_LOCAL_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)));
    stale.forEach((key) => localStorage.removeItem(key));
  } catch {
  }
}

export function signOutRedirect(to: string) {
  window.location.assign(to);
}
