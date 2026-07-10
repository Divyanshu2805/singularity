import { useEffect, useState, type CSSProperties, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { ArrowRight, CircleAlert, Eye, EyeOff, Info } from "lucide-react";
import { AnimatedLogo } from "@/components/VibeCraftLogo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MIN_PASSWORD_LENGTH, passwordStrength } from "@/lib/auth-form";
import { cn } from "@/lib/utils";

/**
 * Soft ember light that drifts slowly. Plain gradients on a single layer that only moves via `transform`:
 * no blur filters and no backdrop blur on top, which is what made an earlier version stutter.
 */
function AuthBackground() {
    return (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
            <div
                className="absolute -inset-[15%] animate-aurora-drift [will-change:transform] motion-reduce:animate-none"
                style={{
                    backgroundImage: [
                        "radial-gradient(40% 32% at 50% 100%, hsl(22 90% 55% / 0.28), transparent 72%)",
                        "radial-gradient(30% 28% at 15% 95%, hsl(340 82% 58% / 0.14), transparent 72%)",
                        "radial-gradient(30% 28% at 85% 95%, hsl(38 95% 60% / 0.12), transparent 72%)",
                        "radial-gradient(45% 30% at 50% 0%, hsl(25 78% 56% / 0.07), transparent 72%)",
                    ].join(", "),
                }}
            />
        </div>
    );
}

/** Cycles through spark glyphs, echoing the spark in the logo. */
const SPINNER_FRAMES = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];

function SparkSpinner() {
    const [frame, setFrame] = useState(0);
    useEffect(() => {
        const timer = window.setInterval(() => setFrame((current) => (current + 1) % SPINNER_FRAMES.length), 120);
        return () => window.clearInterval(timer);
    }, []);
    return (
        <span aria-hidden="true" className="inline-block w-3.5 text-center">
            {SPINNER_FRAMES[frame]}
        </span>
    );
}

/**
 * Shared frame for sign-in and sign-up: the pitch on the left and the form in a window on the right,
 * stacked on small screens. The form column is sized to take sign-in-with buttons later.
 */
export function AuthLayout({ windowTitle, raiseBy = 0, extendBelow = 0, animateRaise = false, children }: {
    windowTitle: string;
    /** Pixels the card extends upward on wide screens, e.g. the sign-up name field's height. */
    raiseBy?: number;
    /** Pixels of extra content below that shouldn't re-centre the card either, e.g. the strength meter row. */
    extendBelow?: number;
    animateRaise?: boolean;
    children: ReactNode;
}) {
    return (
        <div className="relative min-h-screen overflow-x-hidden bg-background">
            <AuthBackground />
            <div className="relative mx-auto grid min-h-screen w-full max-w-6xl content-center items-center gap-12 px-5 py-12 sm:px-8 lg:grid-cols-2 lg:gap-16">
                <header className="flex flex-col items-center text-center">
                    <AnimatedLogo markClassName="h-16 w-16 sm:h-20 sm:w-20" nameClassName="text-[36px] sm:text-[46px]" />
                    <h1 className="mt-8 font-display text-[40px] font-semibold leading-tight tracking-tight sm:text-[52px]">
                        Turn ideas into{" "}
                        {/* Its own line beside the form; w-fit keeps the gradient spanning just the words. The gradient
                            only paints inside the box, so the bottom padding makes room for descenders like the "g"
                            and the negative margin gives that space back to the layout. */}
                        <span className="bg-gradient-to-r from-[hsl(36_90%_62%)] to-[hsl(12_78%_55%)] bg-clip-text pb-[0.16em] text-transparent lg:mx-auto lg:-mb-[0.16em] lg:block lg:w-fit">
                            working apps.
                        </span>
                    </h1>
                    <p className="mt-5 max-w-md text-[15px] leading-7 text-muted-foreground sm:text-base">
                        Describe what you want to build. VibeCraft writes the code, and you shape it through conversation.
                    </p>
                </header>

                <main className="mx-auto w-full max-w-[440px]">
                    {/* On wide screens extra sign-up content never changes the card's layout height: `top` lifts it by
                        `raiseBy` and a matching negative margin cancels both that and `extendBelow`. So the sign-in
                        layout stays centred, and switching grows the card up from the email field (and a little
                        downward for the strength row) without re-centring - the email field never moves. */}
                    <div
                        style={{ "--raise": `${raiseBy}px`, "--extend": `${extendBelow}px` } as CSSProperties}
                        className={cn(
                            "overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.7)] animate-slide-up motion-reduce:animate-none lg:relative lg:[margin-bottom:calc((var(--raise)_+_var(--extend))*-1)] lg:[top:calc(var(--raise)*-1)]",
                            animateRaise && "transition-[top,margin-bottom] duration-300 ease-out motion-reduce:transition-none"
                        )}
                    >
                        {/* Window title bar */}
                        <div className="flex h-11 items-center border-b border-border/60 bg-panel/80 px-4">
                            <div aria-hidden="true" className="flex w-14 gap-1.5">
                                <span className="h-3 w-3 rounded-full bg-[#ff5f57]/85" />
                                <span className="h-3 w-3 rounded-full bg-[#febc2e]/85" />
                                <span className="h-3 w-3 rounded-full bg-[#28c840]/85" />
                            </div>
                            <p key={windowTitle} className="flex-1 truncate text-center text-sm text-muted-foreground animate-fade-in">
                                {windowTitle}
                            </p>
                            <span aria-hidden="true" className="w-14" />
                        </div>
                        <div className="p-6 sm:p-8">{children}</div>
                    </div>
                </main>
            </div>
        </div>
    );
}

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
    id: string;
    label: string;
    error?: string;
    hint?: ReactNode;
    /** Controls inside the right edge of the input, e.g. a show-password button. */
    trailing?: ReactNode;
    /** Sits at the right end of the label row, e.g. a "Forgot password?" link. */
    labelAction?: ReactNode;
}

export function AuthField({ id, label, error, hint, trailing, labelAction, className, ...inputProps }: AuthFieldProps) {
    const note = error ?? hint;
    const noteId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

    return (
        <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={id} className="block text-[13px] font-medium text-foreground/85">
                    {label}
                </label>
                {labelAction}
            </div>
            <div
                className={cn(
                    "group flex h-11 items-center gap-2.5 rounded-lg border bg-background/60 pl-3 pr-1.5 transition-[border-color,box-shadow,background-color] duration-150 focus-within:bg-background focus-within:ring-[3px]",
                    error
                        ? "border-destructive/60 focus-within:ring-destructive/15"
                        : "border-border/80 hover:border-primary/35 focus-within:border-primary/60 focus-within:ring-primary/15"
                )}
            >
                {/* A terminal-style prompt that lights up while the field is active */}
                <span
                    aria-hidden="true"
                    className={cn(
                        "select-none text-base font-semibold leading-none transition-colors",
                        error ? "text-destructive" : "text-muted-foreground/50 group-focus-within:text-primary"
                    )}
                >
                    ›
                </span>
                <input
                    id={id}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={noteId}
                    className={cn(
                        "h-full min-w-0 flex-1 bg-transparent text-sm text-foreground caret-primary outline-none placeholder:text-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-60",
                        className
                    )}
                    {...inputProps}
                />
                {trailing}
            </div>
            {note && (
                <div id={noteId} className={cn("text-xs leading-5", error ? "flex gap-2 pl-0.5 text-destructive animate-fade-in" : "text-muted-foreground")}>
                    {/* Errors read like a command's result line */}
                    {error && <span aria-hidden="true" className="select-none text-muted-foreground/60">⎿</span>}
                    {error ? <span className="min-w-0">{error}</span> : note}
                </div>
            )}
        </div>
    );
}

/** Password input with a show/hide toggle and a Caps Lock warning. */
export function PasswordField({ onKeyUp, onKeyDown, onBlur, hint, ...props }: Omit<AuthFieldProps, "type" | "trailing">) {
    const [isVisible, setIsVisible] = useState(false);
    const [isCapsLockOn, setIsCapsLockOn] = useState(false);
    const trackCapsLock = (e: KeyboardEvent<HTMLInputElement>) => setIsCapsLockOn(e.getModifierState("CapsLock"));

    return (
        <AuthField
            {...props}
            type={isVisible ? "text" : "password"}
            onKeyDown={(e) => {
                trackCapsLock(e);
                onKeyDown?.(e);
            }}
            onKeyUp={(e) => {
                trackCapsLock(e);
                onKeyUp?.(e);
            }}
            onBlur={(e) => {
                setIsCapsLockOn(false);
                onBlur?.(e);
            }}
            hint={
                isCapsLockOn ? (
                    <span className="flex items-center gap-1.5 text-primary">
                        <Info aria-hidden="true" className="h-3.5 w-3.5" />
                        Caps Lock is on
                    </span>
                ) : (
                    hint
                )
            }
            trailing={
                <button
                    type="button"
                    onClick={() => setIsVisible((visible) => !visible)}
                    aria-label={isVisible ? "Hide password" : "Show password"}
                    aria-pressed={isVisible}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
            }
        />
    );
}

const STRENGTH_LABELS = ["Too short", "Weak", "Okay", "Good", "Strong"];
const STRENGTH_BARS = ["", "bg-destructive/80", "bg-amber-500/80", "bg-primary/85", "bg-emerald-500/80"];
const STRENGTH_TEXT = ["text-muted-foreground", "text-destructive", "text-amber-500", "text-primary", "text-emerald-500"];

/**
 * One fixed-height row under the signup password: four bars, a one-word rating, and the advice tucked
 * into a tooltip. Its space is always reserved but it stays invisible until typing starts, so it
 * appearing (or changing) never shifts or resizes the form.
 */
export function PasswordStrength({ password }: { password: string }) {
    const score = passwordStrength(password);
    const isShown = password.length > 0;

    return (
        <div
            aria-hidden={!isShown}
            className={cn(
                "flex h-5 items-center gap-3 transition-[opacity,visibility] duration-200",
                isShown ? "visible opacity-100" : "invisible opacity-0"
            )}
        >
            <div aria-hidden="true" className="grid flex-1 grid-cols-4 gap-1">
                {[1, 2, 3, 4].map((segment) => (
                    <span
                        key={segment}
                        className={cn("h-1 rounded-full transition-colors duration-300", segment <= score ? STRENGTH_BARS[score] : "bg-border/70")}
                    />
                ))}
            </div>
            <span aria-live="polite" className={cn("w-[4.5rem] shrink-0 text-right text-xs font-medium", STRENGTH_TEXT[score])}>
                {password ? STRENGTH_LABELS[score] : ""}
            </span>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        tabIndex={-1}
                        aria-label="Password tips"
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-primary"
                    >
                        <Info className="h-3.5 w-3.5" />
                    </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="end" className="max-w-[230px] text-xs leading-5">
                    Use at least {MIN_PASSWORD_LENGTH} characters. Mixing in capitals, numbers, and symbols makes it stronger.
                </TooltipContent>
            </Tooltip>
        </div>
    );
}

export function FormAlert({ tone = "error", title, children }: { tone?: "error" | "info"; title: string; children: ReactNode }) {
    const isError = tone === "error";
    const Icon = isError ? CircleAlert : Info;
    return (
        <div
            role={isError ? "alert" : "status"}
            className={cn(
                "rounded-lg border px-3 py-2.5 text-center text-[13px] leading-5 animate-fade-in",
                isError ? "border-destructive/40 bg-destructive/10" : "border-primary/30 bg-primary/10"
            )}
        >
            <p className="flex items-center justify-center gap-2 font-medium text-foreground">
                <Icon aria-hidden="true" className={cn("h-4 w-4 shrink-0", isError ? "text-destructive" : "text-primary")} />
                {title}
            </p>
            <p className="mt-0.5 text-muted-foreground">{children}</p>
        </div>
    );
}

export function AuthSubmitButton({ isLoading, loadingText, children }: { isLoading: boolean; loadingText: string; children: ReactNode }) {
    return (
        <button
            type="submit"
            disabled={isLoading}
            aria-busy={isLoading}
            className="group flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-[0_10px_24px_-12px_hsl(var(--primary)/0.8)] transition-[filter,transform] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:translate-y-px disabled:cursor-wait disabled:brightness-95"
        >
            {isLoading ? (
                <>
                    <SparkSpinner />
                    {loadingText}
                </>
            ) : (
                <>
                    {children}
                    <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
            )}
        </button>
    );
}

/** Google's multicolour "G", drawn inline so the button needs nothing loaded from Google before it's clicked. */
function GoogleMark() {
    return (
        <svg aria-hidden="true" viewBox="0 0 48 48" className="h-[18px] w-[18px] shrink-0">
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
        </svg>
    );
}

export function GoogleButton({ onClick, isLoading, disabled, children }: {
    onClick: () => void;
    isLoading: boolean;
    disabled?: boolean;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled || isLoading}
            aria-busy={isLoading}
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-border/80 bg-background/60 text-sm font-medium text-foreground transition-[border-color,background-color,transform] duration-150 hover:border-primary/35 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 aria-busy:cursor-wait"
        >
            {isLoading ? <SparkSpinner /> : <GoogleMark />}
            {isLoading ? "Waiting for Google…" : children}
        </button>
    );
}

export function AuthDivider({ label = "or" }: { label?: string }) {
    return (
        <div className="my-5 flex items-center gap-3" role="separator" aria-label={label}>
            <span className="h-px flex-1 bg-border/70" />
            <span className="text-xs uppercase tracking-wider text-muted-foreground/70">{label}</span>
            <span className="h-px flex-1 bg-border/70" />
        </div>
    );
}

/** A quiet in-form link, e.g. "Forgot password?" or "Back to sign in". */
export function AuthTextLink({ onClick, children, disabled }: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="text-xs font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
            {children}
        </button>
    );
}
