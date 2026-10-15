/**
 * The whole-page "can't reach Singularity" screen, laid over whatever page was open while the server does not answer.
 *
 * Handles: covering the page - and clearing its toasts - with the app's status stage (StatusScreen) in its alert form as soon
 * as lib/server-reach says nobody is answering; asking again every few seconds, when the browser comes back online,
 * and when Try again is pressed - by fetching the page's own queries again, since a check of some other endpoint can
 * succeed while the service behind the page is still down; and, once they answer, going away and having every query
 * fetch again, so the lists that failed underneath fill in without a reload.
 *
 * It lays itself over the page rather than replacing it, so a half-typed prompt, open tabs or a chat in progress are
 * still there when the connection returns. The page underneath is made inert while it shows, so focus cannot wander
 * into it. The components' own failure states - the sidebar's card, the dashboard's box - are still drawn under it,
 * for failures that are not the whole server (a JSON error the backend did send); this screen is for "nobody answered".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { StatusScreen } from "@/components/app/StatusScreen";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { toast as sonner } from "sonner";
import { Button } from "@/components/ui/button";
import { dismissAllToasts } from "@/hooks/use-toast";
import { probeServer, SERVER_UNREACHABLE } from "@/lib/api";
import { askAgain, useServerUnreachable } from "@/lib/server-reach";

const PROBE_EVERY_MS = 5000;

export function ServerUnreachable() {
  const unreachable = useServerUnreachable();
  const queryClient = useQueryClient();
  const [probing, setProbing] = useState(false);
  const wasUnreachable = useRef(false);
  const overlay = useRef<HTMLDivElement>(null);

  const retry = useCallback(
    () => askAgain(() => Promise.all([probeServer(), queryClient.refetchQueries({ type: "active" })])),
    [queryClient],
  );

  const probe = () => {
    setProbing(true);
    void retry().finally(() => setProbing(false));
  };

  useEffect(() => {
    if (unreachable) {
      wasUnreachable.current = true;
      dismissAllToasts();
      sonner.dismiss();
      return;
    }
    if (wasUnreachable.current) {
      wasUnreachable.current = false;
      void queryClient.invalidateQueries();
    }
  }, [unreachable, queryClient]);

  useEffect(() => {
    if (!unreachable) return;
    const timer = window.setInterval(() => void retry(), PROBE_EVERY_MS);
    const onOnline = () => void retry();
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [unreachable, retry]);

  useEffect(() => {
    if (!unreachable) return;
    const page = Array.from(document.body.children).filter(
      (element): element is HTMLElement => element instanceof HTMLElement && element !== overlay.current,
    );
    page.forEach((element) => element.setAttribute("inert", ""));
    return () => page.forEach((element) => element.removeAttribute("inert"));
  }, [unreachable]);

  if (!unreachable) return null;

  return createPortal(
    <div ref={overlay} className="fixed inset-0 overflow-y-auto" style={{ zIndex: 2147483647 }}>
      <StatusScreen
        alert
        eyebrow="Offline"
        title="Can't reach"
        accent="Singularity"
        actions={
          <Button variant="chip" className="gap-1.5" onClick={probe} disabled={probing} autoFocus>
            {probing ? <OrbitSpinner /> : <RotateCcw />}
            {probing ? "Trying again" : "Try again"}
          </Button>
        }
        footer={<p className="text-xs text-muted-foreground">This page will come back by itself as soon as the server answers. Nothing you had open is lost.</p>}
      >
        {SERVER_UNREACHABLE}
      </StatusScreen>
    </div>,
    document.body,
  );
}
