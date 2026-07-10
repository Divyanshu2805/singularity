export type AuthMode = "login" | "signup";

export interface AuthFieldErrors {
    name?: string;
    email?: string;
    password?: string;
}

// Mirror the backend's LoginRequest/SignupRequest constraints, so most mistakes are caught before a round trip.
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_NAME_LENGTH = 30;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateAuthForm(
    mode: AuthMode,
    values: { name?: string; email: string; password: string }
): AuthFieldErrors {
    const errors: AuthFieldErrors = {};

    if (mode === "signup") {
        const name = values.name?.trim() ?? "";
        if (!name) errors.name = "Tell us what to call you";
        else if (name.length > MAX_NAME_LENGTH) errors.name = `Keep it to ${MAX_NAME_LENGTH} characters or fewer`;
    }

    const email = values.email.trim();
    if (!email) errors.email = "Enter your email address";
    else if (!EMAIL_PATTERN.test(email)) errors.email = "That doesn't look like an email address";

    if (!values.password) errors.password = mode === "login" ? "Enter your password" : "Choose a password";
    else if (mode === "signup" && values.password.length < MIN_PASSWORD_LENGTH) {
        errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
    }

    return errors;
}

/** The first field with an error, in the order the fields appear, so it can be focused. */
export const firstInvalidField = (errors: AuthFieldErrors) =>
    (["name", "email", "password"] as const).find((field) => errors[field]);

export interface FriendlyAuthError {
    message: string;
    /** Set when the fix is on the other auth page, e.g. the account already exists. */
    suggestSignIn?: boolean;
}

/** Turns backend/network errors into something a person can act on. */
export function friendlyAuthError(error: unknown, mode: AuthMode): FriendlyAuthError {
    const raw = error instanceof Error ? error.message : "";

    if (/can't reach/i.test(raw)) {
        return { message: "We can't reach VibeCraft right now. Check that the server is running, then try again." };
    }
    if (/already exists/i.test(raw)) {
        return { message: "An account with this email already exists.", suggestSignIn: true };
    }
    if (mode === "login" && /bad credentials|invalid|unauthori[sz]ed|login failed|validation failed|not found/i.test(raw)) {
        // Deliberately vague about which one is wrong, like the backend.
        return { message: "That email and password don't match. Double-check them and try again." };
    }
    if (/validation failed/i.test(raw)) {
        return { message: "A few details need another look. Check the fields below and try again." };
    }
    return {
        message:
            raw ||
            (mode === "login" ? "We couldn't sign you in. Please try again." : "We couldn't create your account. Please try again."),
    };
}

/** 0-4, for the signup strength meter. Below the minimum length always scores 0. */
export function passwordStrength(password: string): number {
    if (password.length < MIN_PASSWORD_LENGTH) return 0;
    return [
        true,
        /[a-z]/.test(password) && /[A-Z]/.test(password),
        /\d/.test(password) || /[^A-Za-z0-9]/.test(password),
        password.length >= 12,
    ].filter(Boolean).length;
}

/** The email step of "forgot password" - the same rules as the sign-in form's email field. */
export function validateEmail(value: string): string | undefined {
    const email = value.trim();
    if (!email) return "Enter your email address";
    if (!EMAIL_PATTERN.test(email)) return "That doesn't look like an email address";
    return undefined;
}

export interface ResetPasswordErrors {
    password?: string;
    confirm?: string;
}

/** Mirrors ResetPasswordRequest's constraint, plus the confirmation only the browser can check. */
export function validateNewPassword(password: string, confirm: string): ResetPasswordErrors {
    const errors: ResetPasswordErrors = {};
    if (!password) errors.password = "Choose a new password";
    else if (password.length < MIN_PASSWORD_LENGTH) errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
    if (!errors.password && password !== confirm) errors.confirm = "The passwords don't match";
    return errors;
}
