/**
 * The page for a URL nothing serves.
 *
 * Handles: saying so, logging the attempted path for diagnosis, and offering the way home.
 *
 * It is set in the app's night - the quiet sky, the horizon mark, a Fraunces headline with an italic gold close
 * and the app's primary button home - so a wrong turn still looks like the same place.
 */
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, type CSSProperties } from "react";
import { ArrowLeft } from "lucide-react";
import { HorizonMark } from "@/components/HorizonMark";
import { LandingBackdrop } from "@/components/landing/LandingBackdrop";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6">
      <LandingBackdrop mode="quiet" />
      <div className="relative flex flex-col items-center text-center">
        <span className="relative mb-7 inline-flex h-14 w-14">
          <span aria-hidden="true" className="nav-brand-glow pointer-events-none absolute -inset-[60%] rounded-full" />
          <HorizonMark drawn className="relative h-full w-full" />
        </span>
        <p className="app-eyebrow app-fade" style={{ "--i": 1 } as CSSProperties}>
          404
        </p>
        <h1
          className="landing-heading app-fade mt-4 font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[44px]"
          style={{ "--i": 2 } as CSSProperties}
        >
          This page is <em className="heat-text animate-heat-sweep pr-1 font-medium motion-reduce:animate-none">off the map</em>
        </h1>
        <p className="app-fade mt-3 max-w-sm text-sm text-muted-foreground" style={{ "--i": 3 } as CSSProperties}>
          Nothing lives at {location.pathname}. Head back and pick up where you left off.
        </p>
        <Button
          onClick={() => navigate("/")}
          style={{ "--i": 4, "--icon-hover": "translateX(-2px)" } as CSSProperties}
          className="app-rise mt-7 gap-1.5"
        >
          <ArrowLeft />
          Take me home
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
