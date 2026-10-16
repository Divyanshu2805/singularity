/**
 * The door in front of every page that needs a signed-in person.
 *
 * Handles: sending someone the browser does not remember as signed in straight to the sign-in page, before any page
 * draws; holding the app's night (AppLoading) while the server confirms the session the browser does remember; and
 * then drawing the page, or going to the sign-in page - in place, with no reload - when the server says it is over.
 *
 * Without it a visitor who was not signed in saw the dashboard - sidebar, name, recent projects - for a moment before
 * being sent to sign in. With a session the server had ended, the page drew from the hint in local storage and only
 * its first request found out. With no session at all, opening /projects directly (as the address bar's autocomplete
 * does) drew the page, whose own redirect came only after its first render.
 * The check is made once per page load (lib/api confirmSession), so moving between signed-in pages shows no loader.
 */
import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { AppLoading } from "@/components/app/AppLoading";
import { confirmSession, isAuthenticated, isSessionConfirmed, loginRedirectPath } from "@/lib/api";

type GateState = "checking" | "open" | "expired";

export function SessionGate() {
  const [signedOutTo] = useState(() => (isAuthenticated() ? null : loginRedirectPath()));
  const [state, setState] = useState<GateState>(() => (isSessionConfirmed() ? "open" : "checking"));

  useEffect(() => {
    if (signedOutTo || state !== "checking") return;
    let cancelled = false;
    confirmSession().then((signedIn) => {
      if (!cancelled) setState(signedIn ? "open" : "expired");
    });
    return () => {
      cancelled = true;
    };
  }, [signedOutTo, state]);

  if (signedOutTo) return <Navigate to={signedOutTo} replace />;
  if (state === "checking") return <AppLoading />;
  if (state === "expired") return <Navigate to="/login?expired=1" replace />;
  return <Outlet />;
}
