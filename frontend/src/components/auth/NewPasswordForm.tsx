/**
 * The "new password" and "confirm" pair with its strength meter.
 *
 * Handles: validating the two fields against each other, checking the provider's password policy before the round
 * trip where that is available, submitting, and showing a refusal in place.
 *
 * Shared by every place a password gets set - a reset link, and changing it from security settings - so the rules and
 * the wording cannot drift between them.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { AuthSubmitButton, FormAlert, PasswordField, PasswordStrength } from "@/components/auth/AuthLayout";
import { validateNewPassword, type ResetPasswordErrors } from "@/lib/auth-form";

export function NewPasswordForm({
    onSubmit,
    checkPolicy,
    submitLabel = "Reset password",
    loadingLabel = "Updating your password…",
    errorTitle = "Couldn't reset your password",
    errorExtra,
}: {
    onSubmit: (password: string) => Promise<void>;
    checkPolicy?: (password: string) => Promise<string | null>;
    submitLabel?: string;
    loadingLabel?: string;
    errorTitle?: string;
    errorExtra?: (message: string) => ReactNode;
}) {
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [fieldErrors, setFieldErrors] = useState<ResetPasswordErrors>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const errors = validateNewPassword(password, confirm);
        if (!errors.password && checkPolicy) {
            const problem = await checkPolicy(password);
            if (problem) errors.password = problem;
        }
        setFieldErrors(errors);
        setFormError(null);
        if (errors.password || errors.confirm) {
            document.getElementById(errors.password ? "password" : "confirm")?.focus();
            return;
        }

        setIsLoading(true);
        try {
            await onSubmit(password);
        } catch (err) {
            setFormError(err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.");
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} noValidate>
            {formError && (
                <div className="mb-4">
                    <FormAlert title={errorTitle}>
                        {formError}
                        {errorExtra?.(formError)}
                    </FormAlert>
                </div>
            )}

            <div className="space-y-4">
                <div>
                    <PasswordField
                        id="password"
                        label="New password"
                        autoComplete="new-password"
                        autoFocus
                        placeholder="Create a password"
                        value={password}
                        error={fieldErrors.password}
                        disabled={isLoading}
                        onChange={(e) => {
                            setPassword(e.target.value);
                            setFieldErrors((prev) => ({ ...prev, password: undefined }));
                            setFormError(null);
                        }}
                    />
                    <div className="pt-1.5">
                        <PasswordStrength password={password} />
                    </div>
                </div>
                <PasswordField
                    id="confirm"
                    label="Confirm new password"
                    autoComplete="new-password"
                    placeholder="Type it again"
                    value={confirm}
                    error={fieldErrors.confirm}
                    disabled={isLoading}
                    onChange={(e) => {
                        setConfirm(e.target.value);
                        setFieldErrors((prev) => ({ ...prev, confirm: undefined }));
                        setFormError(null);
                    }}
                />
            </div>

            <div className="mt-6">
                <AuthSubmitButton isLoading={isLoading} loadingText={loadingLabel}>
                    {submitLabel}
                </AuthSubmitButton>
            </div>
        </form>
    );
}
