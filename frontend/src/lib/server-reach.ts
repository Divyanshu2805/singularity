/**
 * Whether the app can reach its server at all, as the last requests found it.
 *
 * Handles: reading a response - or its absence - as "reachable" or "not", the set of requests that are failing for
 * that reason, asking again, and the subscription the whole-page "can't reach Singularity" screen
 * (components/app/ServerUnreachable) reads it through.
 *
 * A dropped connection used to be reported by whichever component happened to be fetching: the sidebar drew its own
 * "Couldn't load projects" card, the dashboard its own box, a toast a third time, and the rest of the page went on as
 * if nothing were wrong. The owner asked for one whole-page state instead. Every request goes through api.ts's
 * rawFetch, which reports here.
 *
 * What counts: no response at all; any 5xx to a GET, since a GET is the page loading what it shows, and the Gateway's
 * own JSON 503 for a service that is down used to slip past as "the backend speaking" and leave every component to
 * say "Couldn't load" on its own; and a 5xx to a write only when it is not the backend's JSON error model - what the
 * dev proxy sends with nobody behind it. A write's JSON 5xx stays with the component that sent it (starting a
 * preview on a full runner pool is a 503 with a code).
 *
 * A failing GET is remembered by its path and cleared only by that path answering, not by any answer: with the
 * Gateway and account-service up and workspace-service down, a session check succeeds while the project list keeps
 * failing, and clearing on any answer made the screen blink off and back on. A request that got no answer at all,
 * or a write, is cleared by any answer. askAgain retries and then drops what it did not see fail again, so a failed
 * GET nothing retries cannot hold the screen up for good. It is not user data, so it does not register with onSignOut.
 */
import { useSyncExternalStore } from "react";

const ANY_ANSWER = "*";
const failing = new Set<string>();
let failedThisRound: Set<string> | null = null;
const listeners = new Set<() => void>();

export const isNobodyAnswering = (status: number, contentType: string | null, method = "GET") =>
  status >= 500 && (method.toUpperCase() === "GET" || !/json/i.test(contentType ?? ""));

export const answerKey = (url: string, method = "GET") =>
  method.toUpperCase() === "GET" ? url.split("?")[0] : ANY_ANSWER;

function changing(change: () => void) {
  const was = failing.size > 0;
  change();
  if (was !== failing.size > 0) listeners.forEach((listener) => listener());
}

export function reportAnswer(key: string, nobodyAnswering: boolean) {
  changing(() => {
    if (nobodyAnswering) {
      failing.add(key);
      failedThisRound?.add(key);
    } else {
      failing.delete(key);
      failing.delete(ANY_ANSWER);
    }
  });
}

export const reportNoAnswer = () => reportAnswer(ANY_ANSWER, true);

export async function askAgain(retry: () => Promise<unknown>) {
  if (failedThisRound) return;
  const before = [...failing];
  const failed = new Set<string>();
  failedThisRound = failed;
  try {
    await retry();
  } finally {
    failedThisRound = null;
    changing(() => before.forEach((key) => !failed.has(key) && failing.delete(key)));
  }
}

export function resetReach() {
  changing(() => failing.clear());
}

export const isServerUnreachable = () => failing.size > 0;

export function subscribeToReach(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const useServerUnreachable = () => useSyncExternalStore(subscribeToReach, isServerUnreachable);
