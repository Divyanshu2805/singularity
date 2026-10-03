/**
 * Sign-in and sign-up as one card.
 *
 * Handles: both modes, validating before anything is sent, password and Google sign-in, the second-factor step,
 * sending a verification email, and exchanging the result for this app's session before moving on.
 *
 * The card is headed by the eclipse over a headline ("Welcome back", or "Start building" when creating an account).
 * The eclipse plays by itself on a slow loop - twenty seconds to totality, which is the logo, then the sun comes back
 * and the next begins (Eclipse.tsx); while anything is in
 * flight its glow breathes, and a refusal slips the moon back as it shakes the card. The second-factor view has its
 * own. Once every field would pass (ready - a name, an address that looks like one, and a password: any password to
 * sign in, one long enough to create an account) the submit button's light warms, so the form can be seen to be
 * ready before it is sent.
 *
 * Both routes render this same component, so switching keeps what has been typed and animates the difference instead
 * of swapping pages: the headline's words drop in anew, the switch's gold chip glides across, the name field opens
 * above the email field (the mark and the card staying centred as the card grows; the eclipse carries on where it
 * was) and the button's label rises into its new wording. As each field comes to hold something that would pass - an
 * address that looks like one, a name, and when creating an account a password long enough - a tick draws itself at
 * its end (the fields' valid); a password being typed to sign in gets none, since only the server can say whether it
 * is right. While a sign-in is in flight the submit button shows the
 * app's comet; a refusal shakes the card once. The second-factor code is entered in six boxes and sent as soon as
 * the sixth digit is in, and the form's rows are marked data-cascade so the stage can bring them up in turn.
 */
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Lock, Mail, MailCheck, UserRound } from "lucide-react";
import type { MultiFactorResolver } from "firebase/auth";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AuthLayout } from "@/components/auth/AuthLayout";
import {
    AuthCardHeading,
    AuthDivider,
    AuthField,
    AuthModeSwitch,
    AuthSecondaryButton,
    AuthSubmitButton,
    AuthTextLink,
    CodeField,
    FormAlert,
    GoogleButton,
    PasswordField,
    PasswordStrength,
} from "@/components/auth/AuthForm";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { isAuthenticated } from "@/lib/api";
import {
    MAX_NAME_LENGTH,
    MIN_PASSWORD_LENGTH,
    firstInvalidField,
    friendlyAuthError,
    validateAuthForm,
    validateEmail,
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

const COPY: Record<AuthMode, { submit: string; loading: string; google: string; lead: string; accent: string }> = {
    login: { submit: "Sign in", loading: "Signing you in…", google: "Continue with Google", lead: "Welcome", accent: "back" },
    signup: { submit: "Create account", loading: "Creating your account…", google: "Sign up with Google", lead: "Start", accent: "building" },
};

const TITLES: Record<AuthMode | "second-factor" | "check-inbox", string> = {
    login: "Sign in to Singularity",
    signup: "Create your Singularity account",
    "second-factor": "Two-step verification",
    "check-inbox": "Check your inbox",
};

const STRENGTH_ROW_HEIGHT = 26;

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
    const [shake, setShake] = useState(0);
    const isBusy = isLoading || isGoogleLoading;
    const checks = isSignup
        ? [Boolean(name.trim()) && name.trim().length <= MAX_NAME_LENGTH, !validateEmail(email), password.length >= MIN_PASSWORD_LENGTH]
        : [!validateEmail(email), password.length > 0];
    const ready = checks.every(Boolean);

    const [step, setStep] = useState<"form" | "second-factor" | "check-inbox">("form");
    const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
    const [code, setCode] = useState("");
    const [inbox, setInbox] = useState<{ email: string; reason: "signup" | "unverified" } | null>(null);

    const nameContentRef = useRef<HTMLDivElement>(null);
    const [nameHeight, setNameHeight] = useState(0);
    const [canAnimate, setCanAnimate] = useState(false);
    useLayoutEffect(() => {
        const el = nameContentRef.current;
        if (!el) return;
        const measure = () => el.offsetHeight && setNameHeight(el.offsetHeight);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        const timer = window.setTimeout(() => setCanAnimate(true), 50);
        return () => {
            observer.disconnect();
            window.clearTimeout(timer);
        };
    }, [step]);

    useEffect(() => {
        if (isAuthenticated()) navigate("/projects", { replace: true });
    }, [navigate]);

    const previousModeRef = useRef(mode);
    useEffect(() => {
        if (previousModeRef.current === mode) return;
        previousModeRef.current = mode;
        document.getElementById(isSignup ? "name" : email ? "password" : "email")?.focus({ preventScroll: true });
    }, [mode, isSignup, email]);

    const refuse = () => setShake((count) => count + 1);

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
                      title: firstName ? `Welcome to Singularity, ${firstName}` : "Welcome to Singularity",
                      description: "Your account is ready. Let's build something.",
                  }
                : {
                      title: firstName ? `Welcome back, ${firstName}` : "Welcome back",
                      description: "Picking up right where you left off.",
                  }
        );
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

    const handleGoogle = async () => {
        setFormError(null);
        setIsGoogleLoading(true);
        try {
            handleOutcome(await signInWithGoogle());
        } catch (error) {
            setFormError({ message: friendlyFirebaseError(error, "Couldn't sign you in with Google. Please try again.") });
            setIsGoogleLoading(false);
            refuse();
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
            refuse();
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
            refuse();
        }
    };

    const verifyCode = async (value: string) => {
        if (!resolver || isLoading) return;
        if (!/^\d{6}$/.test(value)) {
            setFormError({ message: "Enter the 6-digit code from your authenticator app." });
            refuse();
            return;
        }
        setFormError(null);
        setIsLoading(true);
        try {
            handleOutcome(await completeSecondFactor(resolver, value));
        } catch (error) {
            setFormError({ message: friendlyFirebaseError(error, "That code didn't work. Please try again.") });
            setIsLoading(false);
            refuse();
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
            <AuthLayout title={TITLES["second-factor"]} view="second-factor" shake={shake}>
                <div data-cascade>
                    <AuthCardHeading eclipse={{ busy: isLoading, slip: shake }} title="Enter your" accent="code">
                        Open your authenticator app and type the 6-digit code for Singularity.
                    </AuthCardHeading>
                </div>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void verifyCode(code);
                    }}
                    noValidate
                    className="mt-7"
                >
                    {formError && (
                        <div className="mb-5">
                            <FormAlert title="Couldn't verify the code">{formError.message}</FormAlert>
                        </div>
                    )}
                    <div data-cascade>
                        <CodeField
                            id="code"
                            label="Verification code"
                            value={code}
                            disabled={isLoading}
                            invalid={Boolean(formError)}
                            onChange={(next) => {
                                setCode(next);
                                setFormError(null);
                            }}
                            onComplete={(full) => void verifyCode(full)}
                        />
                    </div>
                    <div data-cascade className="mt-7">
                        <AuthSubmitButton isLoading={isLoading} loadingText="Verifying…">
                            Verify
                        </AuthSubmitButton>
                    </div>
                </form>
                <p data-cascade className="mt-6 text-center">
                    <AuthTextLink onClick={backToForm} disabled={isLoading}>
                        Use a different account
                    </AuthTextLink>
                </p>
            </AuthLayout>
        );
    }

    if (step === "check-inbox" && inbox) {
        return (
            <AuthLayout title={TITLES["check-inbox"]} view="check-inbox">
                <div data-cascade>
                    <AuthCardHeading icon={MailCheck} title={inbox.reason === "signup" ? "Confirm your email" : "Verify your email first"}>
                        We sent a link to <span className="font-medium text-foreground">{inbox.email}</span>.{" "}
                        {inbox.reason === "signup"
                            ? "Open it to activate your account, then sign in."
                            : "Your account can't be used until the address is confirmed. Open the link, then sign in again."}
                    </AuthCardHeading>
                </div>
                <p data-cascade className="mt-5 text-center text-[12.5px] leading-5 text-muted-foreground/80">
                    Nothing arrived? Check spam - or sign in again to get a new link.
                </p>
                <div data-cascade className="mt-7">
                    <AuthSecondaryButton onClick={backToForm}>Back to sign in</AuthSecondaryButton>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout title={TITLES[mode]} shake={shake}>
            <div data-cascade>
                <AuthCardHeading eclipse={{ busy: isBusy, slip: shake }} title={copy.lead} accent={copy.accent} compact={isSignup} />
            </div>
            <div data-cascade className="mt-5">
                <AuthModeSwitch mode={mode} onChange={switchMode} disabled={isBusy} />
            </div>

            <form onSubmit={handleSubmit} noValidate className="mt-4">
                {formError ? (
                    <div className="mb-5">
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
                    <div className="mb-5">
                        <FormAlert tone="info" title="Email verified">
                            Thanks for confirming. Sign in to get started.
                        </FormAlert>
                    </div>
                ) : wasPasswordReset ? (
                    <div className="mb-5">
                        <FormAlert tone="info" title="Password updated">
                            Sign in with your new password.
                        </FormAlert>
                    </div>
                ) : (
                    isSessionExpired && (
                        <div className="mb-5">
                            <FormAlert tone="info" title="You were signed out">
                                For your security, sessions end after a while. Your projects are right where you left them.
                            </FormAlert>
                        </div>
                    )
                )}

                <div data-cascade>
                    <GoogleButton onClick={handleGoogle} isLoading={isGoogleLoading} disabled={isLoading}>
                        {copy.google}
                    </GoogleButton>
                </div>
                <div data-cascade>
                    <AuthDivider label="or with email" tight={isSignup} />
                </div>

                <div
                    aria-hidden={!isSignup}
                    style={{ height: isSignup ? nameHeight : 0 }}
                    className={cn(
                        "flex flex-col justify-end overflow-hidden",
                        canAnimate && "transition-[height,opacity] duration-300 ease-out motion-reduce:transition-none",
                        isSignup ? "opacity-100" : "opacity-0"
                    )}
                >
                    <div ref={nameContentRef} className="shrink-0 pb-3">
                        <AuthField
                            id="name"
                            label="Name"
                            icon={UserRound}
                            autoComplete="name"
                            autoFocus={isSignup}
                            maxLength={MAX_NAME_LENGTH}
                            placeholder="What should we call you?"
                            tabIndex={isSignup ? undefined : -1}
                            value={name}
                            valid={Boolean(name.trim()) && name.trim().length <= MAX_NAME_LENGTH}
                            error={isSignup ? fieldErrors.name : undefined}
                            disabled={!isSignup || isBusy}
                            onChange={(e) => {
                                setName(e.target.value);
                                clearErrorFor("name");
                            }}
                        />
                    </div>
                </div>

                <div className="space-y-3">
                    <div data-cascade>
                        <AuthField
                            id="email"
                            label="Email"
                            icon={Mail}
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            autoFocus={!isSignup}
                            spellCheck={false}
                            placeholder="you@example.com"
                            value={email}
                            valid={!validateEmail(email)}
                            error={fieldErrors.email}
                            disabled={isBusy}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                clearErrorFor("email");
                            }}
                        />
                    </div>

                    <div data-cascade>
                        <PasswordField
                            id="password"
                            label="Password"
                            icon={Lock}
                            autoComplete={isSignup ? "new-password" : "current-password"}
                            placeholder={isSignup ? "Create a password" : "Your password"}
                            value={password}
                            valid={isSignup ? password.length >= MIN_PASSWORD_LENGTH : undefined}
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

                <div data-cascade className={cn("transition-[margin] duration-300 ease-out motion-reduce:transition-none", isSignup ? "mt-4" : "mt-5")}>
                    <AuthSubmitButton isLoading={isLoading} loadingText={copy.loading} ready={ready}>
                        {copy.submit}
                    </AuthSubmitButton>
                </div>
            </form>
        </AuthLayout>
    );
}
