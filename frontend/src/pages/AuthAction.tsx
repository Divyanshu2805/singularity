import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { applyActionCode, checkActionCode } from "firebase/auth";
import { AuthLayout, AuthSubmitButton, AuthTextLink, FormAlert } from "@/components/auth/AuthLayout";
import { NewPasswordForm } from "@/components/auth/NewPasswordForm";
import { firebaseEnabled, friendlyFirebaseError, getFirebaseAuth } from "@/lib/firebase";
import { applyResetCode, checkResetCode, passwordPolicyProblem, sendResetEmail } from "@/lib/firebase-auth";

type View =
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "reset"; email: string }
    | { kind: "verified" }
    | { kind: "recovered"; email: string };

/**
 * Handles the links in Firebase's emails - password reset, email verification, email-change recovery - inside this
 * app's own UI instead of Firebase's hosted page. Wired up by setting the email templates' custom action URL to
 * `<app origin>/auth/action` in the Firebase console.
 *
 * <p>The one-time `oobCode` is lifted out of the address bar on load, for the same reason as a legacy reset token.
 */
export default function AuthAction() {
    const navigate = useNavigate();
    const [params] = useState(() => new URLSearchParams(window.location.search));
    const mode = params.get("mode");
    const oobCode = params.get("oobCode") ?? "";
    const [view, setView] = useState<View>({ kind: "loading" });
    const [isResending, setIsResending] = useState(false);
    const [resent, setResent] = useState(false);
    // Action codes are single-use, so a second run (React's dev double-effect) must not apply it again.
    const hasRun = useRef(false);

    useEffect(() => {
        if (hasRun.current) return;
        hasRun.current = true;
        window.history.replaceState(null, "", window.location.pathname);

        if (!firebaseEnabled || !mode || !oobCode) {
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
                // Someone changed this account's email and the owner is undoing it: restore the old address.
                const info = await checkActionCode(auth, oobCode);
                await applyActionCode(auth, oobCode);
                setView({ kind: "recovered", email: info.data.email ?? "" });
            } else {
                setView({ kind: "error", message: "This link isn't one VibeCraft recognises." });
            }
        };
        run().catch((error) => setView({ kind: "error", message: friendlyFirebaseError(error, "This link didn't work. Request a new one.") }));
    }, [mode, oobCode]);

    return (
        <AuthLayout windowTitle="VibeCraft — account">
            {view.kind === "loading" && (
                <p role="status" className="py-6 text-center text-sm text-muted-foreground animate-fade-in">
                    Checking your link…
                </p>
            )}

            {view.kind === "error" && (
                <div className="space-y-4 text-center">
                    <FormAlert title="This link didn't work">{view.message}</FormAlert>
                    <div className="flex justify-center gap-4">
                        {mode === "resetPassword" && (
                            <AuthTextLink onClick={() => navigate("/forgot-password", { replace: true })}>Request a new reset link</AuthTextLink>
                        )}
                        <AuthTextLink onClick={() => navigate("/login", { replace: true })}>Back to sign in</AuthTextLink>
                    </div>
                </div>
            )}

            {view.kind === "reset" && (
                <>
                    <div className="mb-6 text-center animate-fade-in">
                        <h2 className="text-lg font-semibold tracking-tight text-foreground">Choose a new password</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            For <span className="font-medium text-foreground">{view.email}</span>. This signs you out everywhere else.
                        </p>
                    </div>
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
                </>
            )}

            {view.kind === "verified" && (
                <div className="text-center animate-fade-in">
                    <MailCheck aria-hidden="true" className="mx-auto h-10 w-10 text-primary" />
                    <h2 className="mt-4 text-lg font-semibold tracking-tight text-foreground">Email verified</h2>
                    <p className="mt-2 text-sm text-muted-foreground">Your account is ready. Sign in to get started.</p>
                    <form className="mt-6" onSubmit={(e) => { e.preventDefault(); navigate("/login?verified=1", { replace: true }); }}>
                        <AuthSubmitButton isLoading={false} loadingText="">
                            Sign in
                        </AuthSubmitButton>
                    </form>
                </div>
            )}

            {view.kind === "recovered" && (
                <div className="space-y-4 text-center animate-fade-in">
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">Your email address was restored</h2>
                    <p className="text-sm leading-6 text-muted-foreground">
                        The account's email is <span className="font-medium text-foreground">{view.email}</span> again. If you didn't
                        change it, someone else may have had access - reset your password now.
                    </p>
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
            )}
        </AuthLayout>
    );
}
