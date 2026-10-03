/**
 * The pieces every sign-in form is built from: the sign-in pages (AuthPage, ForgotPassword, AuthAction and its
 * NewPasswordForm), and the forms inside the app that ask for a password or a code again (Security settings and its
 * "confirm it's you" dialog).
 *
 * Handles: they are made of the signed-in app's own materials, as the owner asked once the dashboard and the chat
 * were settled, so that signing in already looks like the place it leads to. They were the landing page's before -
 * its lit gold pill with a knob, its glass ghost button and an amber glass chip - set on the landing's plan card.
 *
 * - AuthCardHeading heads a view: the dashboard's arrangement of a mark over a Fraunces headline whose last word is
 *   the gold heat-text (accent). The mark is either the eclipse (eclipse - Eclipse.tsx's Eclipse, a slow solar eclipse
 *   on a loop whose totality is the logo) or an icon on a small dark medallion (icon) for the views that only report
 *   something. When the headline's words change (switching between
 *   signing in and creating an account) they drop in again one by one, as the dashboard's do. compact draws the
 *   eclipse smaller, easing between the two sizes: the sign-up form carries a name field more than the sign-in one,
 *   and the owner wanted it shorter still than the sign-in form, which was itself tightened (a smaller eclipse,
 *   44px fields and buttons, closer rows); AuthDivider's tight does the same for the space round the divider.
 * - AuthModeSwitch is the dashboard's segmented control: a sunken track with the gold selection chip (the .seg-pill
 *   recipe), which glides to the side being chosen with the same springy slide as the All projects and chat page
 *   switches - a transform, so the compositor runs it and it stays smooth while the form re-renders, the name field
 *   opens and the nebula draws. It used to stretch towards that side by animating its left and right edges, which
 *   relaid it out every frame on the main thread and stuttered at exactly that moment.
 * - AuthField is a sunken well, darker than the card, as the workspace's fields are: a mono capital label over it
 *   (the app's .app-label), the field's icon on a small round tile like the prompt's badge, which turns gold while
 *   the field has focus and stays lit once it holds something (data-filled). The well lifts a pixel and takes the
 *   app's calm gold ring on focus; a tick draws itself at its end once what is typed would pass (valid) and undraws
 *   if it stops passing; the icon wags once if the field is refused. Typing releases gold dust off the caret
 *   (lib/stardust.ts): one mote per character, a small cluster for a paste, each rising a little and fading.
 * - PasswordField's show/hide control is Eclipse.tsx's EclipseEye, an eye whose pupil is the sun, eclipsed while the
 *   password is hidden. It still names itself "Show password"/"Hide password" to a screen reader and in its title.
 * - PasswordStrength is a small constellation of four stars that light up in turn as the password gets stronger, the
 *   lines between lit stars drawing themselves, coloured by how strong it is, with the word for it beside them.
 * - CodeField is the six-box entry for an authenticator code: one real input laid invisibly over the boxes, so
 *   pasting, the platform's one-time-code autofill and a screen reader all see an ordinary text field; it reports the
 *   code once all six digits are in.
 * - AuthSubmitButton, GoogleButton and AuthSecondaryButton are ui/button's primary and outline buttons at full width,
 *   with the same hover as everywhere in the app (the gold light following the pointer, the lift). The submit's body
 *   is near-black here, darker than the app's primary (.btn-primary.auth-submit - the owner asked for it blacker),
 *   keeping the gold light under its lower edge; the outline button is a dark matte charcoal a step under it, so the
 *   submit stays the one that stands out. The submit swaps its wording by rising the new words in (only when it
 *   changes - not as the page opens, when the row it sits in rises anyway), shows the app's comet (OrbitSpinner)
 *   while it works and stays at full strength while it does, and once everything in the form would pass (ready) the
 *   light under it warms and grows, so the moment the form can be sent reads on the button.
 * - GoogleButton is also woven from a sheet of space-time (SpacetimeFabric.tsx, on a canvas under its label): a fine
 *   grid with a few stars lying on it, dipping round the Google mark and rippling slowly out from it, which sinks
 *   towards the pointer while it is on the button and sends stronger, quicker waves out while the button waits on
 *   Google. The mark sits in a fixed square (the G, or the comet while it waits) so the sheet knows where its mass is.
 * - AuthDialogCard is the dialog form's surface: the card's eclipse light at its head, on the dialog's own panel.
 *
 * Under reduced motion nothing drops, rises, draws, drifts or loops; every state is simply shown.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { ArrowRight, CircleAlert, Info, type LucideIcon } from "lucide-react";
import { Eclipse, EclipseEye } from "@/components/auth/Eclipse";
import { SpacetimeFabric } from "@/components/auth/SpacetimeFabric";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { HeadlineWords } from "@/components/landing/HeadlineWords";
import { WORD_DROP } from "@/components/landing/intro";
import { play } from "@/components/landing/motion";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MIN_PASSWORD_LENGTH, passwordStrength } from "@/lib/auth-form";
import { emitStardust } from "@/lib/stardust";
import { cn } from "@/lib/utils";

export function AuthDialogCard({ children }: { children: ReactNode }) {
    return (
        <div className="auth-dialog-card relative">
            <div className="relative p-6 pb-8 sm:p-8">{children}</div>
        </div>
    );
}

export function AuthModeSwitch({ mode, onChange, disabled }: { mode: "login" | "signup"; onChange: () => void; disabled?: boolean }) {
    return (
        <div role="group" aria-label="Sign in or create an account" data-mode={mode} className="auth-switch">
            <span aria-hidden="true" className="auth-switch-pill" />
            {(["login", "signup"] as const).map((option) => (
                <button
                    key={option}
                    type="button"
                    aria-pressed={mode === option}
                    disabled={disabled}
                    onClick={() => mode !== option && onChange()}
                    className="auth-switch-option"
                >
                    {option === "login" ? "Sign in" : "Create account"}
                </button>
            ))}
        </div>
    );
}

export function AuthCardHeading({ icon: Icon, eclipse, title, accent, compact = false, children }: {
    icon?: LucideIcon;
    eclipse?: { busy?: boolean; slip?: number };
    title: string;
    accent?: string;
    compact?: boolean;
    children?: ReactNode;
}) {
    const heading = useRef<HTMLHeadingElement>(null);
    const said = useRef(`${title}|${accent ?? ""}`);

    useLayoutEffect(() => {
        const now = `${title}|${accent ?? ""}`;
        if (said.current === now) return;
        said.current = now;
        const words = heading.current?.querySelectorAll("[data-word]");
        if (words) return play(words, WORD_DROP, { delay: 40, step: 60, duration: 800 });
    }, [title, accent]);

    return (
        <div className="text-center">
            {eclipse ? (
                <Eclipse
                    {...eclipse}
                    className={cn(
                        "mx-auto transition-[width,height,margin] duration-300 ease-out motion-reduce:transition-none",
                        compact ? "mb-2.5 h-12 w-12" : "mb-3 h-[3.75rem] w-[3.75rem]"
                    )}
                />
            ) : (
                Icon && (
                    <span className="auth-medallion mx-auto mb-5">
                        <Icon aria-hidden="true" className="h-[22px] w-[22px]" strokeWidth={1.75} />
                    </span>
                )
            )}
            <h2 ref={heading} className="landing-heading font-display text-[28px] font-semibold leading-[1.12] tracking-[-0.02em]">
                <HeadlineWords text={title} />
                {accent && (
                    <>
                        {" "}
                        <em data-word className="heat-text inline-block animate-heat-sweep pb-[0.1em] -mb-[0.1em] pr-1 not-italic motion-reduce:animate-none">
                            {accent}
                        </em>
                    </>
                )}
            </h2>
            {children && <div className="mx-auto mt-2 max-w-sm text-[14px] leading-6 text-muted-foreground">{children}</div>}
        </div>
    );
}

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
    id: string;
    label: string;
    icon?: LucideIcon;
    error?: string;
    hint?: ReactNode;
    trailing?: ReactNode;
    labelAction?: ReactNode;
    valid?: boolean;
}

export function AuthField({ id, label, icon: Icon, error, hint, trailing, labelAction, valid, className, ...inputProps }: AuthFieldProps) {
    const input = useRef<HTMLInputElement>(null);
    const well = useRef<HTMLDivElement>(null);
    const note = error ?? hint;
    const noteId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
    const filled = typeof inputProps.value === "string" && inputProps.value.length > 0;

    useEffect(() => {
        const field = input.current;
        const host = well.current;
        if (!field || !host) return;
        const onInput = (event: Event) => {
            const kind = (event as InputEvent).inputType ?? "";
            if (kind.startsWith("insert")) emitStardust(field, host, kind === "insertFromPaste" ? 5 : 1);
        };
        field.addEventListener("input", onInput);
        return () => field.removeEventListener("input", onInput);
    }, []);

    return (
        <div className="auth-field space-y-2">
            <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={id} className="auth-label block">
                    {label}
                </label>
                {labelAction}
            </div>
            <div ref={well} data-invalid={error ? true : undefined} data-filled={filled || undefined} className="auth-input">
                <span aria-hidden="true" className="auth-input-icon">
                    {Icon ? <Icon className="h-[15px] w-[15px]" strokeWidth={1.9} /> : <span className="select-none text-base font-semibold leading-none">›</span>}
                </span>
                <input
                    ref={input}
                    id={id}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={noteId}
                    className={cn(
                        "auth-entry h-full min-w-0 flex-1 bg-transparent text-[14px] text-foreground caret-primary outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-60",
                        className
                    )}
                    {...inputProps}
                />
                {valid !== undefined && (
                    <span aria-hidden="true" data-on={valid && !error} className="auth-tick">
                        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                            <path pathLength={1} d="M3.6 8.4 6.7 11.4 12.6 5" />
                        </svg>
                    </span>
                )}
                {trailing}
            </div>
            {note && (
                <div id={noteId} className={cn("text-[12.5px] leading-5", error ? "flex items-start gap-1.5 text-destructive animate-in fade-in slide-in-from-top-1 duration-300" : "text-muted-foreground")}>
                    {error && <CircleAlert aria-hidden="true" className="mt-[3px] h-3.5 w-3.5 shrink-0" />}
                    {error ? <span className="min-w-0">{error}</span> : note}
                </div>
            )}
        </div>
    );
}

export function PasswordField({ onKeyUp, onKeyDown, onBlur, hint, ...props }: Omit<AuthFieldProps, "type" | "trailing">) {
    const [isVisible, setIsVisible] = useState(false);
    const [isCapsLockOn, setIsCapsLockOn] = useState(false);
    const trackCapsLock = (e: KeyboardEvent<HTMLInputElement>) => setIsCapsLockOn(e.getModifierState("CapsLock"));
    const action = isVisible ? "Hide password" : "Show password";

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
                    aria-label={action}
                    title={action}
                    aria-pressed={isVisible}
                    className="auth-eye grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <EclipseEye open={isVisible} className="h-[19px] w-[19px]" />
                </button>
            }
        />
    );
}

const CODE_LENGTH = 6;

export function CodeField({ id, label, value, onChange, onComplete, disabled, invalid }: {
    id: string;
    label: string;
    value: string;
    onChange: (code: string) => void;
    onComplete?: (code: string) => void;
    disabled?: boolean;
    invalid?: boolean;
}) {
    const [isFocused, setIsFocused] = useState(false);
    const digits = value.slice(0, CODE_LENGTH);
    const active = Math.min(digits.length, CODE_LENGTH - 1);

    return (
        <div className="space-y-3">
            <label htmlFor={id} className="auth-label block text-center">
                {label}
            </label>
            <div data-invalid={invalid || undefined} className="code-field relative">
                <input
                    id={id}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={CODE_LENGTH}
                    autoFocus
                    spellCheck={false}
                    value={digits}
                    disabled={disabled}
                    aria-invalid={invalid || undefined}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    onChange={(e) => {
                        const next = e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
                        onChange(next);
                        if (next.length === CODE_LENGTH && next !== digits) onComplete?.(next);
                    }}
                    className="absolute inset-0 z-10 h-full w-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent disabled:cursor-not-allowed"
                />
                <div aria-hidden="true" className="grid grid-cols-[1fr_1fr_1fr_auto_1fr_1fr_1fr] items-center gap-1.5 sm:gap-2">
                    {Array.from({ length: CODE_LENGTH }, (_, index) => {
                        const digit = digits[index];
                        const isActive = isFocused && !disabled && index === active && digits.length < CODE_LENGTH;
                        return [
                            index === 3 && <span key="gap" className="mx-0.5 h-px w-2.5 bg-muted-foreground/40" />,
                            <span key={index} data-filled={Boolean(digit)} data-active={isActive} className="code-cell">
                                {digit ? (
                                    <span key={digit} className="code-digit">
                                        {digit}
                                    </span>
                                ) : (
                                    isActive && <span className="code-caret animate-cursor-blink" />
                                )}
                            </span>,
                        ];
                    })}
                </div>
            </div>
        </div>
    );
}

const STRENGTH_LABELS = ["Too short", "Weak", "Okay", "Good", "Strong"];
const STRENGTH_TEXT = ["text-muted-foreground", "text-destructive", "text-amber-400", "text-primary", "text-emerald-400"];
const STARS = [
    { x: 6, y: 11 },
    { x: 30, y: 5.5 },
    { x: 54, y: 12 },
    { x: 78, y: 6.5 },
];

function starPath(x: number, y: number, size: number) {
    const pinch = 0.18 * size;
    return `M ${x} ${y - size} Q ${x + pinch} ${y - pinch} ${x + size} ${y} Q ${x + pinch} ${y + pinch} ${x} ${y + size} Q ${x - pinch} ${y + pinch} ${x - size} ${y} Q ${x - pinch} ${y - pinch} ${x} ${y - size} Z`;
}

export function PasswordStrength({ password }: { password: string }) {
    const score = passwordStrength(password);
    const isShown = password.length > 0;

    return (
        <div
            aria-hidden={!isShown}
            className={cn("flex h-5 items-center gap-3 transition-[opacity,visibility] duration-200", isShown ? "visible opacity-100" : "invisible opacity-0")}
        >
            <svg viewBox="0 0 84 17" aria-hidden="true" className={cn("auth-constellation h-[17px] w-[84px] shrink-0 overflow-visible", STRENGTH_TEXT[score])}>
                {STARS.slice(1).map((star, index) => (
                    <line
                        key={`link-${index}`}
                        pathLength={1}
                        data-on={score >= index + 2}
                        x1={STARS[index].x}
                        y1={STARS[index].y}
                        x2={star.x}
                        y2={star.y}
                        style={{ transitionDelay: `${index * 70 + 60}ms` }}
                        className="auth-constellation-link"
                    />
                ))}
                {STARS.map((star, index) => (
                    <g key={index} data-on={score >= index + 1} style={{ transitionDelay: `${index * 70}ms` }} className="auth-constellation-star">
                        <circle cx={star.x} cy={star.y} r="4.6" className="auth-constellation-halo" />
                        <path d={starPath(star.x, star.y, 3.8)} />
                    </g>
                ))}
            </svg>
            <span aria-live="polite" className={cn("flex-1 text-xs font-medium transition-colors duration-300", STRENGTH_TEXT[score])}>
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
        <div role={isError ? "alert" : "status"} className="auth-reveal">
            <div>
                <div
                    className={cn(
                        "flex gap-3 rounded-xl border px-3.5 py-3 text-left text-[13px] leading-5",
                        isError ? "border-destructive/35 bg-destructive/[0.08]" : "border-primary/25 bg-primary/[0.07]"
                    )}
                >
                    <span
                        className={cn(
                            "mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full",
                            isError ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"
                        )}
                    >
                        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                        <p className="font-medium text-foreground">{title}</p>
                        <p className="mt-0.5 text-muted-foreground">{children}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function useSwapped(label: string) {
    const first = useRef(label);
    const changed = useRef(false);
    if (label !== first.current) changed.current = true;
    return changed.current;
}

export function AuthSubmitButton({ isLoading, loadingText, ready, children }: { isLoading: boolean; loadingText: string; ready?: boolean; children: string }) {
    const label = isLoading ? loadingText : children;
    const swapped = useSwapped(label);

    return (
        <button
            type="submit"
            disabled={isLoading}
            aria-busy={isLoading}
            data-ready={ready || undefined}
            style={{ "--icon-hover": "translateX(3px)" } as CSSProperties}
            className={cn(buttonVariants({ size: "lg" }), "auth-submit h-11 w-full text-[14.5px]")}
        >
            {isLoading && <OrbitSpinner className="h-3.5 w-3.5" />}
            <span key={label} data-swap={swapped || undefined} className="auth-swap">
                {label}
            </span>
            {!isLoading && <ArrowRight aria-hidden="true" />}
        </button>
    );
}

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
    children: string;
}) {
    const label = isLoading ? "Waiting for Google…" : children;
    const swapped = useSwapped(label);
    const mark = useRef<HTMLSpanElement>(null);

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled || isLoading}
            aria-busy={isLoading}
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "auth-google h-11 w-full gap-2.5 text-[14px]")}
        >
            <SpacetimeFabric mass={mark} busy={isLoading} asleep={Boolean(disabled) && !isLoading} />
            <span ref={mark} className="grid h-4 w-4 shrink-0 place-items-center">
                {isLoading ? <OrbitSpinner className="h-3.5 w-3.5" /> : <GoogleMark />}
            </span>
            <span key={label} data-swap={swapped || undefined} className="auth-swap">
                {label}
            </span>
        </button>
    );
}

export function AuthSecondaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={{ "--icon-hover": "translateX(-3px)" } as CSSProperties}
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "auth-google h-11 w-full text-[14px]")}
        >
            {children}
        </button>
    );
}

export function AuthDivider({ label = "or", tight = false }: { label?: string; tight?: boolean }) {
    return (
        <div
            className={cn("flex items-center gap-4 transition-[margin] duration-300 ease-out motion-reduce:transition-none", tight ? "my-3" : "my-4")}
            role="separator"
            aria-label={label}
        >
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-white/[0.14]" />
            <span className="app-label">{label}</span>
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-white/[0.14]" />
        </div>
    );
}

const LINK_MOTES = [
    { "--x": "28%", "--y": "60%", "--s": "2px", "--dx": "4px", "--dy": "-12px", "--t": "2600ms", "--d": "0ms" },
    { "--x": "52%", "--y": "70%", "--s": "1.6px", "--dx": "-5px", "--dy": "-14px", "--t": "3100ms", "--d": "900ms" },
    { "--x": "74%", "--y": "55%", "--s": "2.4px", "--dx": "6px", "--dy": "-11px", "--t": "2800ms", "--d": "1700ms" },
    { "--x": "92%", "--y": "65%", "--s": "1.8px", "--dx": "-3px", "--dy": "-13px", "--t": "3400ms", "--d": "400ms" },
];

export function StardustMotes() {
    return (
        <>
            {LINK_MOTES.map((mote, index) => (
                <span key={index} aria-hidden="true" className="stardust-link-mote" style={mote as CSSProperties} />
            ))}
        </>
    );
}

export function AuthTextLink({ onClick, children, disabled }: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="wipe-link group text-[12.5px] font-medium text-primary hover:text-white focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
            <span className="stardust-text">{children}</span>
            <StardustMotes />
        </button>
    );
}
