/**
 * The page GitHub sends the browser back to after someone agrees to connect their account.
 *
 * Handles: reading the code and the state out of the address, handing them to the server once, and then going back to
 * the project the person left from; and saying in plain words when GitHub was refused, when the server did not accept
 * what came back, or when nothing came back at all.
 *
 * Both its states are the app's status stage (components/app/StatusScreen): ripples spreading from the mark while it
 * connects, and the alert form with the way back when it did not.
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
import { ArrowLeft } from "lucide-react";
import { StatusScreen } from "@/components/app/StatusScreen";
import { Button } from "@/components/ui/button";
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

  if (problem) {
    return (
      <StatusScreen
        alert
        eyebrow="Connection"
        title="GitHub is not"
        accent="connected"
        actions={
          <Button asChild variant="chip" className="gap-1.5">
            <Link to={backTo}>
              <ArrowLeft />
              Back to your project
            </Link>
          </Button>
        }
      >
        {problem}
      </StatusScreen>
    );
  }

  return (
    <StatusScreen busy eyebrow="GitHub" title="Connecting" accent="GitHub">
      Finishing the link with your account. This takes a moment.
    </StatusScreen>
  );
}
