/**
 * The page for a URL nothing serves.
 *
 * Handles: saying so, logging the attempted path for diagnosis, and offering the way home.
 *
 * It is the app's status stage (components/app/StatusScreen) - the star sky, the horizon mark, a Fraunces headline with
 * an italic gold close and the app's chip home - so a wrong turn still looks like the same place, and moves like the
 * error page and the loading page do.
 */
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, type CSSProperties } from "react";
import { ArrowLeft } from "lucide-react";
import { StatusScreen } from "@/components/app/StatusScreen";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <StatusScreen
      eyebrow="404"
      title="This page is"
      accent="off the map"
      actions={
        <Button variant="chip" onClick={() => navigate("/")} style={{ "--icon-hover": "translateX(-2px)" } as CSSProperties} className="gap-1.5">
          <ArrowLeft />
          Take me home
        </Button>
      }
    >
      Nothing lives at <span className="break-all font-mono text-[13px] text-foreground/80">{location.pathname}</span>. Head back and pick up where you left off.
    </StatusScreen>
  );
};

export default NotFound;
