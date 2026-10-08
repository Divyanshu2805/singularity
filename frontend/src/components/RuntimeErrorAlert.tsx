/**
 * An error the preview's own page threw, surfaced beside it.
 *
 * Handles: saying in one plain sentence what went wrong, showing the error itself with its stack folding open under
 * it, offering to have it fixed, opening the preview's output, and dismissing it. A page that loaded and drew nothing
 * is shown the same way under its own heading, since to the person it is the same thing: the app is not there.
 *
 * It is the app's matte glass (index.css, .app-menu) with a red mark for the trouble rather than a red frame and the
 * message in mono. The plain sentence comes first because the person this is for has never read a stack trace; the
 * error's own words are under it for whoever wants them.
 *
 * "Fix this" sends the error to the chat as the next message (lib/preview-fix). An earlier "Fix issues" button did
 * the same and was removed, because the turn it started rewrote the whole file and regularly broke it somewhere
 * else; a change is an edit of a few lines now. The button is not shown to someone who cannot edit the project or
 * while a response is already being written, and after two tries at the same error it gives way to a line asking
 * the person to describe what they were doing - the one thing the error cannot say.
 */
import { AlertCircle, X, ChevronRight, Wrench } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { errorPlace, isBlankPage, plainWords, type FixOffer, type RuntimeError } from "@/lib/preview-fix";

export type { RuntimeError };

interface RuntimeErrorAlertProps {
    error: RuntimeError | null;
    onDismiss: () => void;
    fix?: { offer: FixOffer; onFix: () => void } | null;
    onShowOutput?: () => void;
}

export function RuntimeErrorAlert({ error, onDismiss, fix = null, onShowOutput }: RuntimeErrorAlertProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!error) return null;
    const place = errorPlace(error);
    const isBlank = isBlankPage(error);

    return (
        <div className="absolute bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
            <div className="app-menu w-[400px] overflow-hidden rounded-2xl border">
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-destructive/15">
                            <AlertCircle className="h-4 w-4 text-destructive" />
                        </div>
                        <div>
                            <h3 className="font-display text-[16px] font-semibold tracking-tight text-foreground">{isBlank ? "The page is blank" : "The preview hit an error"}</h3>
                            <p className="text-xs text-muted-foreground">{isBlank ? "Nothing is drawn" : "1 error found"}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onDismiss}
                        aria-label="Dismiss"
                        style={{ "--icon-hover": "scale(0.8)" } as CSSProperties}
                        className="icon-btn h-7 w-7 rounded-lg"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="p-4">
                    <p className="mb-3 text-[13px] leading-relaxed text-foreground/90">{plainWords(error)}</p>
                    <button
                        type="button"
                        aria-expanded={isExpanded}
                        className="group flex w-full cursor-pointer items-start gap-2 rounded-lg text-left text-foreground/85"
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        <ChevronRight
                            className={cn(
                                "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                isExpanded && "rotate-90"
                            )}
                        />
                        <div className="flex-1 overflow-hidden">
                            <div className="mb-1 flex items-center gap-2">
                                <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
                                    {error.source || "Runtime error"}
                                </span>
                                {(place || error.filename) && (
                                    <span className="max-w-[200px] truncate text-xs text-muted-foreground" title={place ?? error.filename}>
                                        {place ? `in ${place}` : `on ${error.filename?.split('/').pop()}`}
                                    </span>
                                )}
                            </div>
                            <p className={cn("break-words font-mono text-xs leading-relaxed text-foreground/85", !isExpanded && "line-clamp-2")}>
                                {error.message}
                            </p>
                        </div>
                    </button>

                    {isExpanded && error.stack && (
                        <div className="mt-3 pl-6 chat-enter">
                            <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap rounded-xl border border-white/[0.07] bg-black/25 p-3 font-mono text-[10px] text-muted-foreground">
                                {error.stack}
                            </pre>
                        </div>
                    )}
                </div>

                {fix?.offer === "exhausted" && (
                    <p className="border-t border-white/[0.06] px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                        This error came back after two fixes. Tell the chat what you were doing when it appeared -
                        which button, which page - so the next fix has more to go on.
                    </p>
                )}

                <div className="flex items-center justify-between border-t border-white/[0.06] bg-black/15 px-3 py-2.5">
                    <div className="flex items-center gap-3 px-1 text-xs text-muted-foreground">
                        <button type="button" onClick={onDismiss} className="rounded-md transition-colors hover:text-foreground">
                            Dismiss
                        </button>
                        <kbd className="sidebar-kbd px-1.5 py-0.5 font-mono text-[10px]">Esc</kbd>
                        {onShowOutput && (
                            <button type="button" onClick={onShowOutput} className="rounded-md transition-colors hover:text-foreground">
                                View output
                            </button>
                        )}
                    </div>
                    {fix?.offer === "offer" && (
                        <Button size="sm" onClick={fix.onFix} className="h-8 gap-1.5 px-3.5 text-xs [&_svg]:size-3.5">
                            <Wrench />
                            Fix this
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
