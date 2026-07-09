/**
 * Everything the browser is holding on behalf of the person currently signed in, and how to let go of it.
 *
 * <p><b>Why this exists.</b> Signing out used to be a react-router `navigate("/login")` - a route change
 * inside the same document. Module-level state lives for the life of the *page*, not the route, so the code
 * notes store and the project chat store both kept their maps intact across it: the next account to sign in
 * on that browser opened a project and read the previous one's transcript, with no request ever having been
 * made for it. `sessionStorage` behaved the same way, and survives a reload too, so a reload alone was never
 * going to be enough either.
 *
 * <p>Two things guard it now. A store registers its own reset here, so the caches are emptied even if nothing
 * reloads; and {@link signOutRedirect} leaves via a full document load, so anything that forgot to register
 * is discarded anyway. Neither is sufficient alone - the registry can be forgotten by a new store, and a
 * reload doesn't touch `sessionStorage` - which is why both are here.
 */

const resetters = new Set<() => void>();

/**
 * Registers state that belongs to the signed-in person and must not outlive them. Called at module scope by
 * each store; the returned value is unused on purpose, since nothing ever unregisters.
 *
 * <p>**If you add a module-level cache of anything a project contains, register it here.**
 */
export function onSignOut(reset: () => void) {
  resetters.add(reset);
}

/**
 * Per-project keys in `localStorage`, matched by **prefix**: each one carries the project id as a suffix
 * (`open_tabs_107`), so an exact-name removal silently misses every real key - which is what a browser run
 * of this caught. Unlike the notes view state these aren't keyed by user, and which files someone had open is
 * still theirs. (`auth_token`/`user_info` are removed by the caller in `api.ts`, where they're written.)
 */
const PROJECT_LOCAL_KEY_PREFIXES = ["open_tabs", "active_tab", "failed_prompt"];

/**
 * Empties everything the current account has accumulated in this page: the registered stores, all of
 * `sessionStorage` (cleared wholesale rather than key by key, so a key added later can't be missed - nothing
 * in there outlives a tab by design), and the per-project `localStorage` entries.
 */
export function clearSignedInState() {
  for (const reset of resetters) {
    try {
      reset();
    } catch {
      // One store failing to reset must not leave the rest holding the previous account's data.
    }
  }

  try {
    sessionStorage.clear();
  } catch {
    // Storage blocked (private mode): there was nothing stored to clear.
  }

  try {
    const stale = Object.keys(localStorage)
      .filter((key) => PROJECT_LOCAL_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)));
    stale.forEach((key) => localStorage.removeItem(key));
  } catch {
    // As above.
  }
}

/**
 * Leaves for the sign-in page by loading the document afresh, **not** by routing to it. That full load is
 * what guarantees a new account starts from nothing, whatever a store forgot to register above.
 */
export function signOutRedirect(to: string) {
  window.location.assign(to);
}
