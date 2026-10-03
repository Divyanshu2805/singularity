/**
 * An error the preview's own page threw, surfaced beside it.
 *
 * Handles: showing what broke and offering to hand it to the chat as a fix request, or to dismiss it.
 *
 * It is the app's matte glass (index.css, .app-menu) with a red mark for the trouble rather than a red frame, the
 * message in mono, its stack folding open under it, and the fix offered as the app's own primary button.
 */
import { AlertCircle, X, Wrench, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export interface RuntimeError {
    message: string;
    source?: string;
    lineno?: number;
    colno?: number;
    filename?: string;
    stack?: string;
}

interface RuntimeErrorAlertProps {
    error: RuntimeError | null;
    onDismiss: () => void;
    onFix: (error: RuntimeError) => void;
}

export function RuntimeErrorAlert({ error, onDismiss, onFix }: RuntimeErrorAlertProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!error) return null;

    return (
        <div className="absolute bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
            <div className="app-menu w-[400px] overflow-hidden rounded-2xl border">
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-destructive/15">
                            <AlertCircle className="h-4 w-4 text-destructive" />
                        </div>
                        <div>
                            <h3 className="font-display text-[16px] font-semibold tracking-tight text-foreground">The preview hit an error</h3>
                            <p className="text-xs text-muted-foreground">1 error found</p>
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
                                {error.filename && (
                                    <span className="max-w-[200px] truncate text-xs text-muted-foreground" title={error.filename}>
                                        on {error.filename.split('/').pop()}
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

                <div className="flex items-center justify-between border-t border-white/[0.06] bg-black/15 px-3 py-2.5">
                    <div className="flex items-center gap-3 px-1 text-xs text-muted-foreground">
                        <button type="button" onClick={onDismiss} className="rounded-md transition-colors hover:text-foreground">
                            Dismiss
                        </button>
                        <kbd className="sidebar-kbd px-1.5 py-0.5 font-mono text-[10px]">Esc</kbd>
                    </div>
                    <Button
                        size="sm"
                        onClick={() => onFix(error)}
                        style={{ "--icon-hover": "rotate(-20deg) scale(1.1)" } as CSSProperties}
                        className="h-8 gap-2 px-4 text-xs"
                    >
                        <Wrench className="h-3.5 w-3.5" />
                        Fix issues
                        <kbd className="hidden h-4 items-center rounded border border-black/15 bg-black/10 px-1 font-mono text-[9px] font-medium sm:inline-flex">
                            F
                        </kbd>
                    </Button>
                </div>
            </div>
        </div>
    );
}
