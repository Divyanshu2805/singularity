/**
 * The page GitHub sends the browser back to after someone agrees to connect their account.
 *
 * Handles: reading the code and the state out of the address, handing them to the server once, and then going back to
 * the project the person left from; and saying in plain words when GitHub was refused, when the server did not accept
 * what came back, or when nothing came back at all.
 *
 * It exists because the server cannot be the place GitHub redirects to. The session cookie is not sent on a
 * navigation that arrives from another site, so the server would see a signed-out caller; this page loads without
 * needing one, and its own request to the server is made from inside the site, with the session.
 *
 * The code is good for one use, so it is sent once even when React runs an effect twice in development. Where to go
 * afterwards was remembered before leaving and is used only if it is a project's page (lib/github).
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { HorizonMark } from "@/components/HorizonMark";
import { api } from "@/lib/api";
import { takeReturnPath } from "@/lib/github";

export function GitHubCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sent = useRef(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [backTo, setBackTo] = useState("/projects");

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const returnPath = takeReturnPath();
    setBackTo(returnPath);
    const code = params.get("code");
    const state = params.get("state");
    if (params.get("error")) {
      setProblem("GitHub was not connected, because the request was turned down there.");
      return;
    }
    if (!code || !state) {
      setProblem("GitHub sent nothing back to finish the connection with. Start it again from the project.");
      return;
    }
    api
      .finishGitHubConnect(code, state)
      .then(() => navigate(returnPath, { replace: true }))
      .catch((error: unknown) => setProblem(error instanceof Error ? error.message : "GitHub could not be connected."));
  }, [params, navigate]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <HorizonMark className="h-8 w-8" />
      {problem ? (
        <>
          <h1 className="font-display text-xl font-semibold tracking-tight">GitHub is not connected</h1>
          <p className="max-w-sm text-sm text-muted-foreground">{problem}</p>
          <Link to={backTo} className="text-sm font-medium text-primary hover:underline">
            Back to your project
          </Link>
        </>
      ) : (
        <>
          <OrbitSpinner />
          <p className="text-sm text-muted-foreground">Connecting GitHub</p>
        </>
      )}
    </main>
  );
}
