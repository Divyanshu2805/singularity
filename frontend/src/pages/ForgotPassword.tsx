/**
 * Asks for a reset link.
 *
 * Handles: validating the address, sending the request, and confirming.
 *
 * The confirmation reads the same whether or not the address has an account, because the backend deliberately does
 * not say - so the wording is conditional rather than promising an email that may never come. The request is headed by
 * the sign-in card's slow eclipse. The card's rows are
 * marked data-cascade, so the stage brings them up in turn when the page opens and again when it changes to the
 * confirmation.
 */
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Mail, MailCheck } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCardHeading, AuthField, AuthSecondaryButton, AuthSubmitButton, AuthTextLink, FormAlert } from "@/components/auth/AuthForm";
import { validateEmail } from "@/lib/auth-form";
import { friendlyFirebaseError } from "@/lib/firebase";
import { sendResetEmail } from "@/lib/firebase-auth";

const TITLE = "Reset your password";

export default function ForgotPassword() {
    const navigate = useNavigate();
    const location = useLocation();
    const prefilled = (location.state as { email?: string } | null)?.email ?? "";

    const [email, setEmail] = useState(prefilled);
    const [fieldError, setFieldError] = useState<string>();
    const [formError, setFormError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [sentTo, setSentTo] = useState<string | null>(null);
    const [shake, setShake] = useState(0);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const error = validateEmail(email);
        setFieldError(error);
        setFormError(null);
        if (error) {
            document.getElementById("email")?.focus();
            setShake((count) => count + 1);
            return;
        }

        setIsLoading(true);
        try {
            await sendResetEmail(email.trim());
            setSentTo(email.trim());
        } catch (err) {
            setFormError(friendlyFirebaseError(err, "Couldn't send the reset email. Please try again."));
            setShake((count) => count + 1);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthLayout title={TITLE} view={sentTo ? "sent" : "ask"} shake={shake}>
            {sentTo ? (
                <>
                    <div data-cascade>
                        <AuthCardHeading icon={MailCheck} title="Check your inbox">
                            If an account exists for <span className="font-medium text-foreground">{sentTo}</span>, we've sent a link to
                            reset its password. It expires in an hour.
                        </AuthCardHeading>
                    </div>
                    <p data-cascade className="mt-5 text-center text-[12.5px] leading-5 text-muted-foreground/80">
                        Nothing arrived? Check spam, or <AuthTextLink onClick={() => setSentTo(null)}>try a different email</AuthTextLink>.
                    </p>
                    <div data-cascade className="mt-7">
                        <AuthSecondaryButton onClick={() => navigate("/login", { replace: true })}>Back to sign in</AuthSecondaryButton>
                    </div>
                </>
            ) : (
                <>
                    <div data-cascade>
                        <AuthCardHeading eclipse={{ busy: isLoading, slip: shake }} title="Forgot your" accent="password?" />
                    </div>

                    <form onSubmit={handleSubmit} noValidate className="mt-7">
                        {formError && (
                            <div className="mb-5">
                                <FormAlert title="Couldn't send the link">{formError}</FormAlert>
                            </div>
                        )}
                        <div data-cascade>
                            <AuthField
                                id="email"
                                label="Email"
                                icon={Mail}
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
                        </div>
                        <div data-cascade className="mt-7">
                            <AuthSubmitButton isLoading={isLoading} loadingText="Sending the link…">
                                Send reset link
                            </AuthSubmitButton>
                        </div>
                    </form>

                    <p data-cascade className="mt-6 text-center text-[13px] text-muted-foreground">
                        Remembered it? <AuthTextLink onClick={() => navigate("/login", { replace: true })}>Back to sign in</AuthTextLink>
                    </p>
                </>
            )}
        </AuthLayout>
    );
}
