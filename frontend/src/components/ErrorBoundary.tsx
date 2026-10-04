/**
 * The last line of defence: catches a render error anywhere below it and shows something instead of a blank page.
 *
 * Handles: logging the error and component stack to the console where it can be read, and the error page
 * (ErrorScreen). On that page the horizon mark builds itself as the page opens - the line draws out, the ring traces
 * itself closed, the core and dome come up and the spark settles - and replays that build whenever the pointer comes
 * onto it, as the landing navigation's mark does; the eyebrow, the Fraunces headline with its gold close, one line of
 * reassurance and the two buttons (reload, or home) rise in turn while it builds. Under them a quiet "Details" toggle
 * folds open a well holding the error's message and a button that copies the full report (message, stack and
 * component stack) for a bug report. Reloading is offered rather than a reset in place because a component that threw
 * while rendering has left unknown state behind, and a full load is the one recovery that is always correct.
 *
 * A React error boundary must be a class component - there is no hook equivalent for catching render errors - so the
 * boundary only holds the error and hands it to a function component that draws the page. The page stays
 * self-contained, since it has to render when the rest of the page could not: its sky is CSS alone (index.css,
 * .error-page) - the night, a soft ember light centred on the mark that comes up with the build, and a sparse scatter
 * of stars and four-point sparks kept away from the middle, each fading in and out on its own clock while a third of
 * them only twinkle, so the sky never pulses as one - with no canvas or sky component. Before this it was a still mark
 * over two wide CSS glows whose warm head met the blue-black foot in a visible band. Under reduced motion the mark
 * appears built, nothing rises and the stars hold still.
 */
import { Component, useEffect, useId, useRef, useState, type CSSProperties, type ErrorInfo, type ReactNode } from "react";
import { Check, ChevronDown, Copy, Home, RotateCcw } from "lucide-react";
import { HorizonMark } from "@/components/HorizonMark";
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

type Star = [x: number, y: number, size: number, peak: number, life: number, delay: number, kind?: "anchor" | "spark"];

const STARS: Star[] = [
  [5, 14, 2, 0.75, 11, -3, "anchor"],
  [12, 31, 1.5, 0.6, 9, -7],
  [4, 47, 1.5, 0.5, 13, -1],
  [17, 9, 1.5, 0.55, 10, -5],
  [22, 58, 2, 0.65, 12, -9, "anchor"],
  [9, 72, 1.5, 0.6, 9, -4],
  [26, 86, 1.5, 0.5, 11, -8],
  [15, 93, 2, 0.6, 14, -2],
  [28, 24, 1, 0.5, 8, -6],
  [19, 41, 7, 0.7, 12, -5, "spark"],
  [94, 10, 2, 0.7, 12, -6, "anchor"],
  [83, 22, 1.5, 0.55, 10, -2],
  [91, 37, 1.5, 0.6, 9, -8],
  [76, 50, 1, 0.45, 11, -3],
  [96, 61, 2, 0.65, 13, -10],
  [86, 77, 1.5, 0.6, 9, -1, "anchor"],
  [73, 90, 1.5, 0.5, 12, -7],
  [92, 92, 1, 0.5, 10, -4],
  [80, 8, 1, 0.45, 9, -9],
  [84, 63, 8, 0.65, 14, -9, "spark"],
  [38, 6, 1.5, 0.5, 10, -4, "anchor"],
  [61, 4, 1, 0.45, 12, -8],
  [44, 95, 1.5, 0.5, 11, -6],
  [58, 91, 1, 0.45, 9, -2],
  [67, 13, 6, 0.55, 13, -4, "spark"],
];

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
    <main className="error-page relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {STARS.map(([x, y, size, peak, life, delay, kind]) => (
          <span
            key={`${x}-${y}`}
            data-kind={kind}
            className="error-star"
            style={
              {
                left: `${x}%`,
                top: `${y}%`,
                "--s": `${size}px`,
                "--o": peak,
                animationDuration: `${life}s`,
                animationDelay: `${delay}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div className="relative flex w-full max-w-xl flex-col items-center">
        <span className="error-mark relative mb-9 inline-flex h-16 w-16" onMouseEnter={replay}>
          <span
            aria-hidden="true"
            className="error-halo pointer-events-none absolute left-1/2 top-1/2 h-[30rem] w-[44rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
          />
          <span aria-hidden="true" className="nav-brand-glow pointer-events-none absolute -inset-[60%] rounded-full" />
          <HorizonMark className="relative h-full w-full" drawn={drawn} />
        </span>

        <p className="app-eyebrow app-fade" style={{ "--i": 1, "--rise-delay": "200ms" } as CSSProperties}>
          Error
        </p>
        <h1
          className="landing-heading app-rise mt-4 font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] text-foreground sm:text-[44px]"
          style={{ "--i": 2, "--rise-delay": "200ms" } as CSSProperties}
        >
          Something went <em className="heat-text animate-heat-sweep pr-1 font-medium motion-reduce:animate-none">wrong</em>
        </h1>
        <p
          className="app-rise mt-4 max-w-sm text-[14.5px] leading-relaxed text-muted-foreground"
          style={{ "--i": 3, "--rise-delay": "200ms" } as CSSProperties}
        >
          Reloading usually fixes it. Your projects and chats are saved on the server, so nothing is lost.
        </p>

        <div
          className="app-rise mt-8 flex flex-wrap items-center justify-center gap-3"
          style={{ "--i": 4, "--rise-delay": "200ms" } as CSSProperties}
        >
          <Button className="gap-1.5" onClick={() => window.location.reload()}>
            <RotateCcw />
            Reload the page
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => window.location.assign("/")}>
            <Home />
            Go home
          </Button>
        </div>

        <div className="app-fade mt-10 flex w-full max-w-md flex-col items-center" style={{ "--i": 7, "--rise-delay": "200ms" } as CSSProperties}>
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
        </div>
      </div>
    </main>
  );
}
