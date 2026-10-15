/**
 * The last line of defence: catches a render error anywhere below it and shows something instead of a blank page.
 *
 * Handles: logging the error and component stack to the console where it can be read, and the error page
 * (ErrorScreen), which is the app's status stage (StatusScreen) in its alert form: the horizon mark builds itself as the
 * page opens - and replays that build whenever the pointer comes onto it - over
 * the star sky, and the eyebrow, the Fraunces headline with its gold close, one line of reassurance and the two buttons
 * (reload, or home) rise in turn while it builds. Under them a quiet "Details" toggle folds open a well holding the
 * error's message and a button that copies the full report (message, stack and component stack) for a bug report.
 * Reloading is offered rather than a reset in place because a component that threw while rendering has left unknown
 * state behind, and a full load is the one recovery that is always correct.
 *
 * A React error boundary must be a class component - there is no hook equivalent for catching render errors - so the
 * boundary only holds the error and hands it to a function component that draws the page. The page stays
 * self-contained, since it has to render when the rest of the page could not: the stage is CSS alone (index.css,
 * .sky-star, .sky-halo), with no canvas and no data to fetch. Under reduced motion the mark appears built, nothing
 * rises and the stars hold still.
 */
import { Component, useEffect, useId, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { Check, ChevronDown, Copy, Home, RotateCcw } from "lucide-react";
import { StatusScreen } from "@/components/app/StatusScreen";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryState {
  error: unknown;
  hasError: boolean;
  componentStack: string | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, hasError: false, componentStack: null };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error, hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled error while rendering:", error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return <ErrorScreen error={this.state.error} componentStack={this.state.componentStack} />;
  }
}

function describe(error: unknown) {
  if (error instanceof Error) return error.message ? `${error.name}: ${error.message}` : error.name;
  return String(error);
}

function report(error: unknown, componentStack: string | null) {
  const summary = describe(error);
  const trace = error instanceof Error ? error.stack ?? "" : "";
  const head = trace.startsWith(summary) ? trace : [summary, trace].filter(Boolean).join("\n");
  return [head, componentStack?.trim()].filter(Boolean).join("\n\nComponent stack:\n");
}

function ErrorScreen({ error, componentStack }: { error: unknown; componentStack: string | null }) {
  const [drawn, setDrawn] = useState(true);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rebuild = useRef<number>();
  const settle = useRef<number>();
  const panelId = useId();

  useEffect(
    () => () => {
      window.clearTimeout(rebuild.current);
      window.clearTimeout(settle.current);
    },
    [],
  );

  const replay = () => {
    if (!drawn || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setDrawn(false);
    window.clearTimeout(rebuild.current);
    rebuild.current = window.setTimeout(() => setDrawn(true), 420);
  };

  const copy = () => {
    navigator.clipboard?.writeText(report(error, componentStack)).then(
      () => {
        setCopied(true);
        window.clearTimeout(settle.current);
        settle.current = window.setTimeout(() => setCopied(false), 1800);
      },
      () => undefined,
    );
  };

  return (
    <StatusScreen
      alert
      drawn={drawn}
      onMarkEnter={replay}
      eyebrow="Error"
      title="Something went"
      accent="wrong"
      actions={
        <>
          <Button variant="chip" className="gap-1.5" onClick={() => window.location.reload()}>
            <RotateCcw />
            Reload the page
          </Button>
          <Button variant="chip" className="gap-1.5" onClick={() => window.location.assign("/")}>
            <Home />
            Go home
          </Button>
        </>
      }
      footer={
        <>
          <button
            type="button"
            className="error-details-toggle"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
          >
            Details
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <div id={panelId} className="error-details w-full" data-open={open} aria-hidden={!open}>
            <div className="min-h-0 overflow-hidden">
              <div className="error-details-well mt-3 flex items-start gap-3 rounded-2xl py-2 pl-4 pr-2 text-left">
                <code className="max-h-32 min-w-0 flex-1 overflow-y-auto break-words py-1.5 font-mono text-[12px] leading-relaxed text-foreground/80">
                  {describe(error)}
                </code>
                <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 px-3 text-xs" tabIndex={open ? 0 : -1} onClick={copy}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          </div>
        </>
      }
    >
      Reloading usually fixes it. Your projects and chats are saved on the server, so nothing is lost.
    </StatusScreen>
  );
}
