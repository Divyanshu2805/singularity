/**
 * What a list or a panel shows when what it was meant to hold could not be fetched: the failure in the whole-page
 * states' language, at the size of the space it stands in.
 *
 * Handles: the horizon mark in a steady glow, a Fraunces line that says what could not be
 * loaded, the reason in a quieter one, and a Try again chip that shows the app's working indicator while the next
 * attempt runs - with nothing circling the mark, which the owner asked to see alone - and the box nudges sideways when that attempt fails as well (index.css, .load-fail-nudge), so the person can see it was tried.
 * It announces itself as an alert.
 *
 * The project lists answered a failed fetch with a toast and then drew the same dashed "no projects yet" box a new
 * account sees, so a dropped connection looked like a lost workspace. This is the box for the failure instead, and
 * every list that fetches can use it with its query's refetch.
 */
import { RotateCcw } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { HorizonMark } from "@/components/HorizonMark";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LoadFailureProps {
  title: string;
  children?: ReactNode;
  onRetry: () => void;
  isRetrying: boolean;
  attempt: number;
  className?: string;
}

export function LoadFailure({ title, children, onRetry, isRetrying, attempt, className }: LoadFailureProps) {
  return (
    <div
      key={attempt}
      role="alert"
      className={cn(
        "app-fade flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 px-6 text-center",
        attempt > 1 && "load-fail-nudge",
        className,
      )}
    >
      <span className="relative mb-6 inline-flex h-10 w-10 items-center justify-center">
        <span aria-hidden="true" className="nav-brand-glow pointer-events-none absolute -inset-[60%] rounded-full" />
        <HorizonMark drawn className="relative h-8 w-8" />
      </span>
      <p className="font-display text-[19px] font-semibold leading-tight tracking-[-0.01em]">{title}</p>
      {children && <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-muted-foreground">{children}</p>}
      <Button variant="chip" onClick={onRetry} disabled={isRetrying} style={{ "--icon-hover": "rotate(-50deg)" } as CSSProperties} className="mt-4 h-8 gap-1.5 px-3.5 text-xs [&_svg]:size-3.5">
        {isRetrying ? <OrbitSpinner /> : <RotateCcw />}
        {isRetrying ? "Trying again" : "Try again"}
      </Button>
    </div>
  );
}
