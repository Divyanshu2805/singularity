import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { MailCheck, ShieldCheck } from "lucide-react";
import type { MultiFactorResolver } from "firebase/auth";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
    AuthDivider,
    AuthField,
    AuthLayout,
    AuthSubmitButton,
    AuthTextLink,
    FormAlert,
    GoogleButton,
    PasswordField,
    PasswordStrength,
} from "@/components/auth/AuthLayout";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { isAuthenticated } from "@/lib/api";
import {
    MAX_NAME_LENGTH,
    firstInvalidField,
    friendlyAuthError,
    validateAuthForm,
    type AuthFieldErrors,
    type AuthMode,
    type FriendlyAuthError,
} from "@/lib/auth-form";
import { friendlyFirebaseError } from "@/lib/firebase";
import {
    completeSecondFactor,
    passwordPolicyProblem,
    signInWithGoogle,
    signInWithPassword,
    signUpWithPassword,
    type SignInOutcome,
} from "@/lib/firebase-auth";
import { cn } from "@/lib/utils";

const COPY: Record<AuthMode, { title: string; subtitle: string; submit: string; loading: string; switchPrompt: string; switchAction: string }> = {
    login: {
        title: "Welcome back",
        subtitle: "Sign in to continue building.",
        submit: "Sign in",
        loading: "Signing you in…",
        switchPrompt: "New to VibeCraft?",
        switchAction: "Create an account",
    },
    signup: {
        title: "Let's build something great",
        subtitle: "Create your account to get started.",
        submit: "Create account",
        loading: "Creating your account…",
        switchPrompt: "Already have an account?",
        switchAction: "Sign in",
    },
};

// PasswordStrength's fixed 20px row plus its 6px top gap.
const STRENGTH_ROW_HEIGHT = 26;

/**
 * Sign-in and sign-up as one card. Both routes render this same component, so switching keeps what's
 * been typed and animates the difference (the name field) instead of swapping pages.
 */
export default function AuthPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { toast } = useToast();
    const [searchParams] = useSearchParams();

    const mode: AuthMode = location.pathname === "/signup" ? "signup" : "login";
    const isSignup = mode === "signup";
    const copy = COPY[mode];
    const isSessionExpired = !isSignup && searchParams.get("expired") === "1";
    const wasPasswordReset = !isSignup && searchParams.get("reset") === "1";
    const wasEmailVerified = !isSignup && searchParams.get("verified") === "1";

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
    const [formError, setFormError] = useState<FriendlyAuthError | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    const isBusy = isLoading || isGoogleLoading;

    // Firebase sign-ins can stop short of a session: a second factor to enter, or an email to verify first.
    const [step, setStep] = useState<"form" | "second-factor" | "check-inbox">("form");
    const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
    const [code, setCode] = useState("");
    const [inbox, setInbox] = useState<{ email: string; reason: "signup" | "unverified" } | null>(null);

    // The name field's natural height, so it opens to exactly that size - and on wide screens the card rises
    // by the same amount at the same pace, keeping the email field still so the name grows out of it.
    const nameContentRef = useRef<HTMLDivElement>(null);
    const [nameHeight, setNameHeight] = useState(0);
    const [canAnimate, setCanAnimate] = useState(false);
    useLayoutEffect(() => {
        const el = nameContentRef.current;
        if (!el) return;
        const measure = () => setNameHeight(el.offsetHeight);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        // Only animate once measured, so opening /signup directly doesn't play the opening animation.
        const timer = window.setTimeout(() => setCanAnimate(true), 50);
        return () => {
            observer.disconnect();
            window.clearTimeout(timer);
        };
    }, []);

    // Someone already signed in has nothing to do here.
    useEffect(() => {
        if (isAuthenticated()) navigate("/projects", { replace: true });
    }, [navigate]);

    // After switching, put the cursor where the new form starts. The first render uses autoFocus instead.
    const previousModeRef = useRef(mode);
    useEffect(() => {
        if (previousModeRef.current === mode) return;
        previousModeRef.current = mode;
        // preventScroll: focusing inside the still-opening name field would otherwise scroll its clipped content.
        document.getElementById(isSignup ? "name" : email ? "password" : "email")?.focus({ preventScroll: true });
    }, [mode, isSignup, email]);

    const switchMode = () => {
        setFieldErrors({});
        setFormError(null);
        navigate(isSignup ? "/login" : "/signup", { replace: true });
    };

    const clearErrorFor = (field: keyof AuthFieldErrors) => {
        if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
        if (formError) setFormError(null);
    };

    const greet = (user: { name?: string } | undefined, isNew: boolean, secondFactorUsed: boolean) => {
        const firstName = user?.name?.trim().split(" ")[0];
        toast(
            isNew
                ? {
                      title: firstName ? `Welcome to VibeCraft, ${firstName}` : "Welcome to VibeCraft",
                      description: "Your account is ready. Let's build something.",
                  }
                : {
                      title: firstName ? `Welcome back, ${firstName}` : "Welcome back",
                      description: "Picking up right where you left off.",
                  }
        );
        // Optional, but worth a nudge: a password alone is one leaked database away from someone else's hands.
        if (!secondFactorUsed) {
            toast({
                title: "Protect your account",
                description: "Add two-step verification with an authenticator app.",
                action: (
                    <ToastAction altText="Set up two-step verification" onClick={() => navigate("/settings/security")}>
                        Set up
                    </ToastAction>
                ),
            });
        }
    };

    const handleOutcome = (outcome: SignInOutcome) => {
        if (outcome.kind === "signed-in") {
            greet(outcome.session.user, outcome.session.newAccount, outcome.session.secondFactorUsed);
            navigate("/projects", { replace: true });
            return;
        }
        if (outcome.kind === "second-factor") {
            setResolver(outcome.resolver);
            setCode("");
            setStep("second-factor");
        } else {
            setInbox({ email: outcome.email, reason: "unverified" });
            setStep("check-inbox");
        }
        setIsLoading(false);
        setIsGoogleLoading(false);
    };

    // A popup, not a redirect: the page keeps its state, and nothing about the attempt has to survive a reload.
    const handleGoogle = async () => {
        setFormError(null);
        setIsGoogleLoading(true);
        try {
            handleOutcome(await signInWithGoogle());
        } catch (error) {
            setFormError({ message: friendlyFirebaseError(error, "Couldn't sign you in with Google. Please try again.") });
            setIsGoogleLoading(false);
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (isGoogleLoading) return;
        const errors = validateAuthForm(mode, { name, email, password });
        if (isSignup && !errors.password) {
            const problem = await passwordPolicyProblem(password);
            if (problem) errors.password = problem;
        }
        setFieldErrors(errors);
        setFormError(null);

        const invalidField = firstInvalidField(errors);
        if (invalidField) {
            document.getElementById(invalidField)?.focus();
            return;
        }

        setIsLoading(true);
        try {
            if (isSignup) {
                await signUpWithPassword(name.trim(), email.trim(), password);
                setInbox({ email: email.trim(), reason: "signup" });
                setStep("check-inbox");
                setPassword("");
                setIsLoading(false);
            } else {
                handleOutcome(await signInWithPassword(email.trim(), password));
            }
        } catch (error) {
            const fallback = isSignup ? "We couldn't create your account. Please try again." : "We couldn't sign you in. Please try again.";
            const message = friendlyFirebaseError(error, "") || friendlyAuthError(error, mode).message || fallback;
            setFormError({ message, suggestSignIn: /already exists/i.test(message) });
            setIsLoading(false);
        }
    };

    const handleSecondFactor = async (e: FormEvent) => {
        e.preventDefault();
        if (!resolver) return;
        if (!/^\d{6}$/.test(code.replace(/\s+/g, ""))) {
            setFormError({ message: "Enter the 6-digit code from your authenticator app." });
            return;
        }
        setFormError(null);
        setIsLoading(true);
        try {
            handleOutcome(await completeSecondFactor(resolver, code));
        } catch (error) {
            setFormError({ message: friendlyFirebaseError(error, "That code didn't work. Please try again.") });
            setIsLoading(false);
        }
    };

    const backToForm = () => {
        setStep("form");
        setResolver(null);
        setCode("");
        setInbox(null);
        setFormError(null);
        if (isSignup) navigate("/login", { replace: true });
    };

    if (step === "second-factor") {
        return (
            <AuthLayout windowTitle="VibeCraft — two-step verification">
                <div className="mb-6 text-center animate-fade-in">
                    <ShieldCheck aria-hidden="true" className="mx-auto h-10 w-10 text-primary" />
                    <h2 className="mt-4 text-lg font-semibold tracking-tight text-foreground">Enter your code</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Open your authenticator app and enter the 6-digit code for VibeCraft.</p>
                </div>
                <form onSubmit={handleSecondFactor} noValidate>
                    {formError && (
                        <div className="mb-4">
                            <FormAlert title="Couldn't verify the code">{formError.message}</FormAlert>
                        </div>
                    )}
                    <AuthField
                        id="code"
                        label="Verification code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoFocus
                        maxLength={7}
                        placeholder="123456"
                        value={code}
                        disabled={isLoading}
                        onChange={(e) => {
                            setCode(e.target.value.replace(/[^\d\s]/g, ""));
                            setFormError(null);
                        }}
                    />
                    <div className="mt-6">
                        <AuthSubmitButton isLoading={isLoading} loadingText="Verifying…">
                            Verify
                        </AuthSubmitButton>
                    </div>
                </form>
                <p className="mt-6 text-center text-sm text-muted-foreground">
                    <AuthTextLink onClick={backToForm} disabled={isLoading}>
                        Use a different account
                    </AuthTextLink>
                </p>
            </AuthLayout>
        );
    }

    if (step === "check-inbox" && inbox) {
        return (
            <AuthLayout windowTitle="VibeCraft — verify your email">
                <div className="text-center animate-fade-in">
                    <MailCheck aria-hidden="true" className="mx-auto h-10 w-10 text-primary" />
                    <h2 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
                        {inbox.reason === "signup" ? "Confirm your email" : "Verify your email first"}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        We sent a link to <span className="font-medium text-foreground">{inbox.email}</span>.{" "}
                        {inbox.reason === "signup"
                            ? "Open it to activate your account, then sign in."
                            : "Your account can't be used until the address is confirmed. Open the link, then sign in again."}
                    </p>
                    <p className="mt-4 text-xs leading-5 text-muted-foreground">Nothing arrived? Check spam - or sign in again to get a new link.</p>
                    <div className="mt-6">
                        <AuthTextLink onClick={backToForm}>Back to sign in</AuthTextLink>
                    </div>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            windowTitle={isSignup ? "VibeCraft — create account" : "VibeCraft — sign in"}
            raiseBy={isSignup ? nameHeight : 0}
            extendBelow={isSignup ? STRENGTH_ROW_HEIGHT : 0}
            animateRaise={canAnimate}
        >
            {/* Keyed so the heading fades in again when switching */}
            <div key={mode} className="mb-6 text-center animate-fade-in">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">{copy.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
            </div>

            <form onSubmit={handleSubmit} noValidate>
                {formError ? (
                    <div className="mb-4">
                        <FormAlert title={isSignup ? "Couldn't create your account" : "Couldn't sign you in"}>
                            {formError.message}
                            {formError.suggestSignIn && (
                                <>
                                    {" "}
                                    <button
                                        type="button"
                                        onClick={switchMode}
                                        className="font-medium text-primary underline-offset-4 hover:underline"
                                    >
                                        Sign in instead
                                    </button>
                                </>
                            )}
                        </FormAlert>
                    </div>
                ) : wasEmailVerified ? (
                    <div className="mb-4">
                        <FormAlert tone="info" title="Email verified">
                            Thanks for confirming. Sign in to get started.
                        </FormAlert>
                    </div>
                ) : wasPasswordReset ? (
                    <div className="mb-4">
                        <FormAlert tone="info" title="Password updated">
                            Sign in with your new password.
                        </FormAlert>
                    </div>
                ) : (
                    isSessionExpired && (
                        <div className="mb-4">
                            <FormAlert tone="info" title="You were signed out">
                                For your security, sessions end after a while. Your projects are right where you left them.
                            </FormAlert>
                        </div>
                    )
                )}

                <GoogleButton onClick={handleGoogle} isLoading={isGoogleLoading} disabled={isLoading}>
                    {isSignup ? "Sign up with Google" : "Continue with Google"}
                </GoogleButton>
                <AuthDivider label="or use email" />

                {/* Name opens to its measured height. Anchored to the bottom, it grows out of the email field when
                    opening and sinks back into it when closing. */}
                <div
                    aria-hidden={!isSignup}
                    style={{ height: isSignup ? nameHeight : 0 }}
                    className={cn(
                        "flex flex-col justify-end overflow-hidden",
                        canAnimate && "transition-[height,opacity] duration-300 ease-out motion-reduce:transition-none",
                        isSignup ? "opacity-100" : "opacity-0"
                    )}
                >
                    <div ref={nameContentRef} className="shrink-0 pb-4">
                            <AuthField
                                id="name"
                                label="Name"
                                autoComplete="name"
                                autoFocus={isSignup}
                                maxLength={MAX_NAME_LENGTH}
                                placeholder="What should we call you?"
                                tabIndex={isSignup ? undefined : -1}
                                value={name}
                                error={isSignup ? fieldErrors.name : undefined}
                                disabled={!isSignup || isBusy}
                                onChange={(e) => {
                                    setName(e.target.value);
                                    clearErrorFor("name");
                                }}
                            />
                    </div>
                </div>

                <div className="space-y-4">
                    <AuthField
                        id="email"
                        label="Email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoFocus={!isSignup}
                        spellCheck={false}
                        placeholder="you@example.com"
                        value={email}
                        error={fieldErrors.email}
                        disabled={isBusy}
                        onChange={(e) => {
                            setEmail(e.target.value);
                            clearErrorFor("email");
                        }}
                    />

                    <div>
                        <PasswordField
                            id="password"
                            label="Password"
                            autoComplete={isSignup ? "new-password" : "current-password"}
                            placeholder={isSignup ? "Create a password" : "Your password"}
                            value={password}
                            error={fieldErrors.password}
                            disabled={isBusy}
                            labelAction={
                                !isSignup && (
                                    <AuthTextLink
                                        disabled={isBusy}
                                        onClick={() => navigate("/forgot-password", { state: { email: email.trim() } })}
                                    >
                                        Forgot password?
                                    </AuthTextLink>
                                )
                            }
                            onChange={(e) => {
                                setPassword(e.target.value);
                                clearErrorFor("password");
                            }}
                        />
                        {/* The strength meter's space opens and closes with the name field, so switching never jumps.
                            On sign-up it stays reserved (empty until typing), so the meter appearing doesn't push anything. */}
                        <div
                            aria-hidden={!isSignup}
                            style={{ height: isSignup ? STRENGTH_ROW_HEIGHT : 0 }}
                            className={cn(
                                "overflow-hidden",
                                canAnimate && "transition-[height,opacity] duration-300 ease-out motion-reduce:transition-none",
                                isSignup ? "opacity-100" : "opacity-0"
                            )}
                        >
                            <div className="pt-1.5">
                                <PasswordStrength password={isSignup ? password : ""} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-6">
                    <AuthSubmitButton isLoading={isLoading} loadingText={copy.loading}>
                        {copy.submit}
                    </AuthSubmitButton>
                </div>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
                {copy.switchPrompt}{" "}
                <button
                    type="button"
                    onClick={switchMode}
                    disabled={isBusy}
                    className="font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                    {copy.switchAction}
                </button>
            </p>
        </AuthLayout>
    );
}
