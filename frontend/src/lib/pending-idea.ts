/**
 * The idea a visitor typed on the landing page, carried through sign-up to the dashboard's prompt.
 *
 * Handles: keeping the idea (and whether they picked Build or Teach me) when they send it from the landing page, and
 * handing it over exactly once to the first dashboard that asks, as long as it is fresh. Nothing is sent anywhere and
 * nothing is built by itself: the dashboard only puts the words back in its prompt, where pressing Build still runs
 * the quota checks and the idea interview.
 *
 * It lives in localStorage rather than sessionStorage because signing in starts a session by clearing everything
 * the browser held for whoever was signed in before (lib/session.ts's clearSignedInState, which empties
 * sessionStorage and runs every onSignOut reset) - and the idea has to survive exactly that step. It is not account
 * data: it can only be written while nobody is signed in (the landing page sends a signed-in visitor straight to
 * their projects), so the next sign-in is the one it belongs to. To keep a forgotten idea from turning up in a
 * stranger's prompt on a shared browser, it is good for MAX_AGE_MS only and is removed the moment it is read.
 */
export interface PendingIdea {
  text: string;
  teaching: boolean;
}

const KEY = "pending_idea";
export const MAX_AGE_MS = 60 * 60 * 1000;
export const MAX_LENGTH = 2000;

export function savePendingIdea(idea: PendingIdea, now = Date.now()) {
  const text = idea.text.trim().slice(0, MAX_LENGTH);
  try {
    if (!text) {
      localStorage.removeItem(KEY);
      return;
    }
    localStorage.setItem(KEY, JSON.stringify({ text, teaching: idea.teaching, savedAt: now }));
  } catch {
  }
}

export function takePendingIdea(now = Date.now()): PendingIdea | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as { text?: unknown; teaching?: unknown; savedAt?: unknown };
    if (typeof stored.text !== "string" || typeof stored.savedAt !== "number") return null;
    const age = now - stored.savedAt;
    if (age < 0 || age > MAX_AGE_MS) return null;
    const text = stored.text.trim().slice(0, MAX_LENGTH);
    return text ? { text, teaching: stored.teaching === true } : null;
  } catch {
    return null;
  }
}
