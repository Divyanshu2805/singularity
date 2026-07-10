import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { AuthField, AuthLayout, AuthSubmitButton, AuthTextLink, FormAlert } from "@/components/auth/AuthLayout";
import { api } from "@/lib/api";
import { validateEmail } from "@/lib/auth-form";
import { firebaseEnabled, friendlyFirebaseError } from "@/lib/firebase";
import { sendResetEmail } from "@/lib/firebase-auth";

/**
 * Asks for a reset link. The confirmation reads the same whether or not the address has an account, because the
 * backend deliberately doesn't say - so the copy says "if", rather than promising an email that may never come.
 */
export default function ForgotPassword() {
    const navigate = useNavigate();
    const location = useLocation();
    const prefilled = (location.state as { email?: string } | null)?.email ?? "";

    const [email, setEmail] = useState(prefilled);
    const [fieldError, setFieldError] = useState<string>();
    const [formError, setFormError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [sentTo, setSentTo] = useState<string | null>(null);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const error = validateEmail(email);
        setFieldError(error);
        setFormError(null);
        if (error) {
            document.getElementById("email")?.focus();
            return;
        }

        setIsLoading(true);
        try {
            if (firebaseEnabled) await sendResetEmail(email.trim());
            else await api.forgotPassword(email.trim());
            setSentTo(email.trim());
        } catch (err) {
            setFormError(friendlyFirebaseError(err, "Couldn't send the reset email. Please try again."));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthLayout windowTitle="VibeCraft — reset password">
            {sentTo ? (
                <div className="text-center animate-fade-in">
                    <MailCheck aria-hidden="true" className="mx-auto h-10 w-10 text-primary" />
                    <h2 className="mt-4 text-lg font-semibold tracking-tight text-foreground">Check your inbox</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        If an account exists for <span className="font-medium text-foreground">{sentTo}</span>, we've sent a link to
                        reset its password. It expires in {firebaseEnabled ? "an hour" : "30 minutes"}.
                    </p>
                    <p className="mt-4 text-xs leading-5 text-muted-foreground">
                        Nothing arrived? Check spam, or{" "}
                        <AuthTextLink onClick={() => setSentTo(null)}>try a different email</AuthTextLink>.
                    </p>
                    <div className="mt-6">
                        <AuthTextLink onClick={() => navigate("/login", { replace: true })}>Back to sign in</AuthTextLink>
                    </div>
                </div>
            ) : (
                <>
                    <div className="mb-6 text-center animate-fade-in">
                        <h2 className="text-lg font-semibold tracking-tight text-foreground">Forgot your password?</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Enter your email and we'll send you a reset link.</p>
                    </div>

                    <form onSubmit={handleSubmit} noValidate>
                        {formError && (
                            <div className="mb-4">
                                <FormAlert title="Couldn't send the link">{formError}</FormAlert>
                            </div>
                        )}
                        <AuthField
                            id="email"
                            label="Email"
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            autoFocus
                            spellCheck={false}
                            placeholder="you@example.com"
                            value={email}
                            error={fieldError}
                            disabled={isLoading}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                setFieldError(undefined);
                                setFormError(null);
                            }}
                        />
                        <div className="mt-6">
                            <AuthSubmitButton isLoading={isLoading} loadingText="Sending the link…">
                                Send reset link
                            </AuthSubmitButton>
                        </div>
                    </form>

                    <p className="mt-6 text-center text-sm text-muted-foreground">
                        Remembered it? <AuthTextLink onClick={() => navigate("/login", { replace: true })}>Back to sign in</AuthTextLink>
                    </p>
                </>
            )}
        </AuthLayout>
    );
}
