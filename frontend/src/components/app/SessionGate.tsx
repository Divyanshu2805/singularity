/**
 * The door in front of every page that needs a signed-in person.
 *
 * Handles: holding the app's night (AppLoading) while the server confirms the session the browser remembers, then
 * drawing the page, or going to the sign-in page - in place, with no reload - when the server says the session is over.
 *
 * Without it a returning visitor whose session had expired saw their dashboard, name and project list for a moment
 * before being sent to sign in: the page drew from the hint in local storage, and only its first request found out.
 * Someone the browser does not remember at all goes straight through; each page already sends them to sign in itself.
 * The check is made once per page load (lib/api confirmSession), so moving between signed-in pages shows no loader.
 */
import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { AppLoading } from "@/components/app/AppLoading";
import { confirmSession, isAuthenticated, isSessionConfirmed } from "@/lib/api";

type GateState = "checking" | "open" | "expired";

export function SessionGate() {
  const [state, setState] = useState<GateState>(() =>
    !isAuthenticated() || isSessionConfirmed() ? "open" : "checking",
  );

  useEffect(() => {
    if (state !== "checking") return;
    let cancelled = false;
    confirmSession().then((signedIn) => {
      if (!cancelled) setState(signedIn ? "open" : "expired");
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  if (state === "checking") return <AppLoading />;
  if (state === "expired") return <Navigate to="/login?expired=1" replace />;
  return <Outlet />;
}
