/**
 * The links in the identity provider's emails - password reset, email verification, email-change recovery - handled
 * inside this app's own UI rather than the provider's hosted page.
 *
 * Handles: reading the mode and the one-time code, verifying it, and running the matching flow.
 *
 * The one-time code is lifted out of the address bar on load: a single-use credential should not sit in the URL where
 * it can be shared or logged. Wired up by pointing the email templates' custom action URL at this route. Each outcome
 * is its own view of the stage's card, so its rows (data-cascade) come up in turn as the check resolves.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, MailCheck, ShieldAlert } from "lucide-react";
import { applyActionCode, checkActionCode } from "firebase/auth";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCardHeading, AuthSubmitButton, AuthTextLink, FormAlert } from "@/components/auth/AuthForm";
import { NewPasswordForm } from "@/components/auth/NewPasswordForm";
import { friendlyFirebaseError, getFirebaseAuth } from "@/lib/firebase";
import { applyResetCode, checkResetCode, passwordPolicyProblem, sendResetEmail } from "@/lib/firebase-auth";

const TITLE = "Finish up your account";

type View =
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "reset"; email: string }
    | { kind: "verified" }
    | { kind: "recovered"; email: string };

export default function AuthAction() {
    const navigate = useNavigate();
    const [params] = useState(() => new URLSearchParams(window.location.search));
    const mode = params.get("mode");
    const oobCode = params.get("oobCode") ?? "";
    const [view, setView] = useState<View>({ kind: "loading" });
    const [isResending, setIsResending] = useState(false);
    const [resent, setResent] = useState(false);
    const hasRun = useRef(false);

    useEffect(() => {
        if (hasRun.current) return;
        hasRun.current = true;
        window.history.replaceState(null, "", window.location.pathname);

        if (!mode || !oobCode) {
            setView({ kind: "error", message: "This link is incomplete. Open it from the email again." });
            return;
        }

        const auth = getFirebaseAuth();
        const run = async () => {
            if (mode === "resetPassword") {
                setView({ kind: "reset", email: await checkResetCode(oobCode) });
            } else if (mode === "verifyEmail") {
                await applyActionCode(auth, oobCode);
                setView({ kind: "verified" });
            } else if (mode === "recoverEmail") {
                const info = await checkActionCode(auth, oobCode);
                await applyActionCode(auth, oobCode);
                setView({ kind: "recovered", email: info.data.email ?? "" });
            } else {
                setView({ kind: "error", message: "This link isn't one Singularity recognises." });
            }
        };
        run().catch((error) => setView({ kind: "error", message: friendlyFirebaseError(error, "This link didn't work. Request a new one.") }));
    }, [mode, oobCode]);

    return (
        <AuthLayout title={TITLE} view={view.kind}>
            {view.kind === "loading" && (
                <p role="status" className="flex items-center justify-center gap-2.5 py-8 text-[14px] text-muted-foreground">
                    <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
                    Checking your link…
                </p>
            )}

            {view.kind === "error" && (
                <>
                    <div data-cascade>
                        <AuthCardHeading icon={ShieldAlert} title="This link didn't work" />
                    </div>
                    <div data-cascade className="mt-6">
                        <FormAlert title="Couldn't use the link">{view.message}</FormAlert>
                    </div>
                    <div data-cascade className="mt-6 flex justify-center gap-5">
                        {mode === "resetPassword" && (
                            <AuthTextLink onClick={() => navigate("/forgot-password", { replace: true })}>Request a new reset link</AuthTextLink>
                        )}
                        <AuthTextLink onClick={() => navigate("/login", { replace: true })}>Back to sign in</AuthTextLink>
                    </div>
                </>
            )}

            {view.kind === "reset" && (
                <>
                    <div data-cascade className="mb-7">
                        <AuthCardHeading icon={KeyRound} title="Choose a new password">
                            For <span className="font-medium text-foreground">{view.email}</span>. This signs you out everywhere else.
                        </AuthCardHeading>
                    </div>
                    <div data-cascade>
                        <NewPasswordForm
                            checkPolicy={passwordPolicyProblem}
                            onSubmit={async (password) => {
                                try {
                                    await applyResetCode(oobCode, password);
                                } catch (error) {
                                    throw new Error(friendlyFirebaseError(error, "Couldn't reset your password. Please try again."));
                                }
                                navigate("/login?reset=1", { replace: true });
                            }}
                        />
                    </div>
                </>
            )}

            {view.kind === "verified" && (
                <>
                    <div data-cascade>
                        <AuthCardHeading icon={MailCheck} title="Email verified">
                            Your account is ready. Sign in to get started.
                        </AuthCardHeading>
                    </div>
                    <form data-cascade className="mt-7" onSubmit={(e) => { e.preventDefault(); navigate("/login?verified=1", { replace: true }); }}>
                        <AuthSubmitButton isLoading={false} loadingText="">
                            Sign in
                        </AuthSubmitButton>
                    </form>
                </>
            )}

            {view.kind === "recovered" && (
                <>
                    <div data-cascade>
                        <AuthCardHeading icon={ShieldAlert} title="Your email address was restored">
                            The account's email is <span className="font-medium text-foreground">{view.email}</span> again. If you didn't
                            change it, someone else may have had access - reset your password now.
                        </AuthCardHeading>
                    </div>
                    <div data-cascade className="mt-6 text-center">
                        {resent ? (
                            <FormAlert tone="info" title="Reset link sent">
                                Check {view.email} for a link to choose a new password.
                            </FormAlert>
                        ) : (
                            <AuthTextLink
                                disabled={isResending}
                                onClick={async () => {
                                    setIsResending(true);
                                    await sendResetEmail(view.email).catch(() => undefined);
                                    setResent(true);
                                    setIsResending(false);
                                }}
                            >
                                Send me a password reset link
                            </AuthTextLink>
                        )}
                    </div>
                </>
            )}
        </AuthLayout>
    );
}
