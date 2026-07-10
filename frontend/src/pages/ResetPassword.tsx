import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthLayout, AuthTextLink, FormAlert } from "@/components/auth/AuthLayout";
import { NewPasswordForm } from "@/components/auth/NewPasswordForm";
import { api } from "@/lib/api";

/**
 * The page a **legacy** reset email opens (`/reset-password?token=…`). Firebase reset links land on `/auth/action`
 * instead. The token is lifted out of the address bar as soon as the page loads: it's a password-equivalent, and a
 * URL leaks into history, screenshots, and Referer headers.
 */
export default function ResetPassword() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [token] = useState(() => searchParams.get("token") ?? "");

    useEffect(() => {
        if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
    }, []);

    const requestNewLink = () => navigate("/forgot-password", { replace: true });

    if (!token) {
        return (
            <AuthLayout windowTitle="VibeCraft — reset password">
                <FormAlert title="This link is incomplete">
                    Open the link from your reset email again, or <AuthTextLink onClick={requestNewLink}>request a new one</AuthTextLink>.
                </FormAlert>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout windowTitle="VibeCraft — reset password">
            <div className="mb-6 text-center animate-fade-in">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">Choose a new password</h2>
                <p className="mt-1 text-sm text-muted-foreground">You'll use it to sign in from now on.</p>
            </div>
            <NewPasswordForm
                onSubmit={async (password) => {
                    await api.resetPassword(token, password);
                    // A full sign-in rather than signing them straight in: it proves the new password works first.
                    navigate("/login?reset=1", { replace: true });
                }}
                errorExtra={(message) =>
                    /expired|invalid/i.test(message) && (
                        <>
                            {" "}
                            <AuthTextLink onClick={requestNewLink}>Request a new link</AuthTextLink>
                        </>
                    )
                }
            />
        </AuthLayout>
    );
}
