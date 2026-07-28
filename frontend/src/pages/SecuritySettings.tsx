/**
 * The account's security page.
 *
 * Handles: re-authenticating before anything below can change, changing the password, enrolling and removing an
 * authenticator app, signing out everywhere, and the recent security events.
 *
 * Re-authentication is asked for up front because the provider demands a recent sign-in for these changes anyway -
 * doing it first means nobody gets halfway through a change and is then refused. Device descriptions are a rough hint
 * from the user agent, not an identity.
 */
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import QRCode from "qrcode";
import { KeyRound, Loader2, LogOut, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import type { MultiFactorInfo, MultiFactorResolver, TotpSecret, User } from "firebase/auth";
import { AppSidebar, SidebarSpacer, SidebarToggleSpace } from "@/components/AppSidebar";
import { AuthField, AuthSubmitButton, FormAlert, GoogleButton, PasswordField } from "@/components/auth/AuthLayout";
import { NewPasswordForm } from "@/components/auth/NewPasswordForm";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSidebar } from "@/hooks/use-sidebar";
import { useToast } from "@/hooks/use-toast";
import { api, getUserInfo, isAuthenticated, loginRedirectPath, signOut } from "@/lib/api";
import { friendlyFirebaseError } from "@/lib/firebase";
import {
    changePassword,
    confirmSecondFactor,
    confirmWithGoogle,
    confirmWithPassword,
    enrolledFactors,
    finishTotpEnrollment,
    passwordPolicyProblem,
    providerIds,
    releaseFirebaseUser,
    removeFactor,
    startTotpEnrollment,
    type ReauthOutcome,
} from "@/lib/firebase-auth";
import type { AuthSecurityEvent, AuthSecurityEventType } from "@/lib/types";

const PAGE_GLOW: CSSProperties = {
    backgroundImage: [
        "radial-gradient(70% 45% at 50% -8%, hsl(22 90% 55% / 0.22) 0%, transparent 70%)",
        "radial-gradient(35% 30% at 92% 0%, hsl(38 95% 60% / 0.10) 0%, transparent 70%)",
    ].join(", "),
};

const EVENT_LABELS: Record<AuthSecurityEventType, string> = {
    ACCOUNT_CREATED: "Account created",
    ACCOUNT_LINKED: "Sign-in method linked",
    SIGN_IN: "Signed in",
    SIGN_IN_REJECTED: "Sign-in blocked",
    SIGN_OUT: "Signed out",
    SIGN_OUT_EVERYWHERE: "Signed out of all devices",
    MFA_ENROLLED: "Two-step verification turned on",
    MFA_REMOVED: "Two-step verification turned off",
    PASSWORD_CHANGED: "Password changed",
};

function describeDevice(userAgent: string | null): string {
    if (!userAgent) return "Unknown device";
    const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : "Browser";
    const os = /Windows/.test(userAgent) ? "Windows" : /Mac OS X/.test(userAgent) ? "macOS" : /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : /Linux/.test(userAgent) ? "Linux" : "";
    return os ? `${browser} on ${os}` : browser;
}

function ConfirmIdentityDialog({ open, onOpenChange, onConfirmed }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirmed: (user: User) => void;
}) {
    const email = getUserInfo()?.username ?? "";
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<"password" | "google" | "code" | null>(null);

    useEffect(() => {
        if (!open) {
            setPassword("");
            setCode("");
            setResolver(null);
            setError(null);
            setBusy(null);
        }
    }, [open]);

    const handle = async (kind: "password" | "google", run: () => Promise<ReauthOutcome>) => {
        setError(null);
        setBusy(kind);
        try {
            const outcome = await run();
            if (outcome.kind === "second-factor") setResolver(outcome.resolver);
            else onConfirmed(outcome.user);
        } catch (err) {
            setError(friendlyFirebaseError(err, "Couldn't confirm it's you. Please try again."));
        } finally {
            setBusy(null);
        }
    };

    const submitCode = async (e: FormEvent) => {
        e.preventDefault();
        if (!resolver) return;
        setError(null);
        setBusy("code");
        try {
            onConfirmed(await confirmSecondFactor(resolver, code));
        } catch (err) {
            setError(friendlyFirebaseError(err, "That code didn't work."));
        } finally {
            setBusy(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Confirm it's you</DialogTitle>
                    <DialogDescription>
                        {resolver ? "Enter the 6-digit code from your authenticator app." : `Sign in again as ${email} to change your security settings.`}
                    </DialogDescription>
                </DialogHeader>

                {error && <FormAlert title="Not confirmed">{error}</FormAlert>}

                {resolver ? (
                    <form onSubmit={submitCode} noValidate className="space-y-4">
                        <AuthField
                            id="confirm-code"
                            label="Verification code"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            autoFocus
                            maxLength={7}
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, ""))}
                        />
                        <AuthSubmitButton isLoading={busy === "code"} loadingText="Verifying…">
                            Verify
                        </AuthSubmitButton>
                    </form>
                ) : (
                    <div className="space-y-4">
                        <GoogleButton onClick={() => void handle("google", confirmWithGoogle)} isLoading={busy === "google"} disabled={busy !== null}>
                            Confirm with Google
                        </GoogleButton>
                        <form
                            noValidate
                            className="space-y-4"
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (password) void handle("password", () => confirmWithPassword(email, password));
                            }}
                        >
                            <PasswordField
                                id="confirm-password"
                                label="Or your password"
                                autoComplete="current-password"
                                value={password}
                                disabled={busy !== null}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            <AuthSubmitButton isLoading={busy === "password"} loadingText="Confirming…">
                                Confirm
                            </AuthSubmitButton>
                        </form>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function TotpSetup({ user, onDone, onCancel }: { user: User; onDone: () => void; onCancel: () => void }) {
    const [secret, setSecret] = useState<TotpSecret | null>(null);
    const [qr, setQr] = useState<string | null>(null);
    const [code, setCode] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        startTotpEnrollment(user)
            .then(async ({ secret, qrUrl }) => {
                const image = await QRCode.toDataURL(qrUrl, { margin: 1, width: 180 });
                if (!cancelled) {
                    setSecret(secret);
                    setQr(image);
                }
            })
            .catch((err) => !cancelled && setError(friendlyFirebaseError(err, "Couldn't start setup. Is TOTP enabled for this Firebase project?")));
        return () => {
            cancelled = true;
        };
    }, [user]);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (!secret) return;
        if (!/^\d{6}$/.test(code.replace(/\s+/g, ""))) {
            setError("Enter the 6-digit code your app shows for VibeCraft.");
            return;
        }
        setError(null);
        setSaving(true);
        try {
            await finishTotpEnrollment(user, secret, code);
            onDone();
        } catch (err) {
            setError(friendlyFirebaseError(err, "That code didn't work. Check the time on your phone and try again."));
            setSaving(false);
        }
    };

    return (
        <div className="mt-4 rounded-xl border border-border/60 bg-background/40 p-4">
            {error && <div className="mb-3"><FormAlert title="Two-step verification isn't on yet">{error}</FormAlert></div>}
            {!secret ? (
                !error && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Preparing a secret…
                    </p>
                )
            ) : (
                <form onSubmit={submit} noValidate className="flex flex-col gap-4 sm:flex-row">
                    {qr && <img src={qr} alt="QR code to scan with an authenticator app" className="h-[180px] w-[180px] shrink-0 rounded-lg bg-white p-1" />}
                    <div className="min-w-0 flex-1 space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Scan this with Google Authenticator, 1Password, Authy or similar. Can't scan? Enter this key:
                        </p>
                        <code className="block break-all rounded-md bg-muted/60 px-2 py-1.5 text-xs">{secret.secretKey}</code>
                        <AuthField
                            id="totp-code"
                            label="Code from the app"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={7}
                            value={code}
                            disabled={isSaving}
                            onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, ""))}
                        />
                        <div className="flex gap-2">
                            <Button type="submit" disabled={isSaving} className="gap-1.5">
                                {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Turn on
                            </Button>
                            <Button type="button" variant="ghost" onClick={onCancel} disabled={isSaving}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                </form>
            )}
        </div>
    );
}

export default function SecuritySettings() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const sidebar = useSidebar();

    const signedIn = isAuthenticated();
    useEffect(() => {
        if (!signedIn) navigate(loginRedirectPath());
    }, [signedIn, navigate]);

    const [events, setEvents] = useState<AuthSecurityEvent[] | null>(null);
    const [eventsError, setEventsError] = useState<string | null>(null);
    const loadEvents = useCallback(() => {
        api.getSecurityEvents()
            .then((list) => {
                setEvents(list);
                setEventsError(null);
            })
            .catch((err) => setEventsError(err instanceof Error ? err.message : "Couldn't load activity."));
    }, []);
    useEffect(() => {
        if (signedIn) loadEvents();
    }, [signedIn, loadEvents]);

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [factors, setFactors] = useState<MultiFactorInfo[]>([]);
    const [settingUp, setSettingUp] = useState(false);
    const [changingPassword, setChangingPassword] = useState(false);
    const [removing, setRemoving] = useState<string | null>(null);
    const [isSigningOutEverywhere, setSigningOutEverywhere] = useState(false);

    useEffect(() => () => void releaseFirebaseUser(), []);

    const finishManaging = () => {
        setUser(null);
        setSettingUp(false);
        setChangingPassword(false);
        void releaseFirebaseUser();
    };

    const onConfirmed = (confirmed: User) => {
        setConfirmOpen(false);
        setUser(confirmed);
        setFactors(enrolledFactors(confirmed));
    };

    const afterChange = (title: string, description: string) => {
        toast({ title, description });
        if (user) setFactors(enrolledFactors(user));
        setSettingUp(false);
        setChangingPassword(false);
        loadEvents();
    };

    const remove = async (factor: MultiFactorInfo) => {
        if (!user) return;
        setRemoving(factor.uid);
        try {
            await removeFactor(user, factor);
            afterChange("Two-step verification is off", "Your account now signs in with one factor.");
        } catch (err) {
            toast({ title: "Couldn't turn it off", description: friendlyFirebaseError(err, "Please try again."), variant: "destructive" });
        } finally {
            setRemoving(null);
        }
    };

    const signOutEverywhere = async () => {
        setSigningOutEverywhere(true);
        try {
            await api.signOutEverywhere();
            signOut("/login");
        } catch (err) {
            toast({ title: "Couldn't sign out everywhere", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
            setSigningOutEverywhere(false);
        }
    };

    const hasPassword = user ? providerIds(user).includes("password") : false;

    return (
        <div className="relative flex h-screen overflow-hidden bg-background">
            <SidebarSpacer sidebar={sidebar} />

            <div className="relative flex min-w-0 flex-1 flex-col">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={PAGE_GLOW} />
                <header className="relative flex h-12 shrink-0 items-center gap-2 px-2">
                    <SidebarToggleSpace sidebar={sidebar} />
                </header>

                <main className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-16 pt-4 sm:px-6">
                        <div className="mb-6">
                            <h1 className="font-display text-3xl font-semibold tracking-tight">Security</h1>
                            <p className="mt-1 text-sm text-muted-foreground">How you sign in, and where you're signed in.</p>
                        </div>

                        <section className="rounded-2xl border border-border/60 bg-panel/70 p-5 backdrop-blur">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Sign-in protection</p>
                                    <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold">
                                        <ShieldCheck className="h-4 w-4 text-primary" /> Two-step verification &amp; password
                                    </h2>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        With two-step verification, a stolen password alone isn't enough to get into your account.
                                    </p>
                                </div>
                                {!user && (
                                    <Button variant="outline" onClick={() => setConfirmOpen(true)}>
                                        Manage
                                    </Button>
                                )}
                                {user && (
                                    <Button variant="ghost" onClick={finishManaging}>
                                        Done
                                    </Button>
                                )}
                            </div>

                            {user && (
                                <div className="mt-5 space-y-5 border-t border-border/50 pt-5">
                                    <div>
                                        <p className="text-sm font-medium">Authenticator app</p>
                                        {factors.length > 0 ? (
                                            <ul className="mt-2 space-y-2">
                                                {factors.map((factor) => (
                                                    <li key={factor.uid} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2">
                                                        <span className="flex min-w-0 items-center gap-2 text-sm">
                                                            <Smartphone className="h-4 w-4 shrink-0 text-emerald-500" />
                                                            <span className="truncate">{factor.displayName || "Authenticator app"}</span>
                                                            <span className="text-xs text-muted-foreground">
                                                                added {formatDistanceToNow(new Date(factor.enrollmentTime), { addSuffix: true })}
                                                            </span>
                                                        </span>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="gap-1.5 text-destructive hover:text-destructive"
                                                            disabled={removing === factor.uid}
                                                            onClick={() => void remove(factor)}
                                                        >
                                                            {removing === factor.uid ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />}
                                                            Remove
                                                        </Button>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : settingUp ? (
                                            <TotpSetup
                                                user={user}
                                                onCancel={() => setSettingUp(false)}
                                                onDone={() => afterChange("Two-step verification is on", "You'll be asked for a code when you sign in.")}
                                            />
                                        ) : (
                                            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                                                <p className="text-xs text-muted-foreground">Off - your account signs in with one factor.</p>
                                                <Button size="sm" onClick={() => setSettingUp(true)}>
                                                    Set up
                                                </Button>
                                            </div>
                                        )}
                                    </div>

                                    {hasPassword && (
                                        <div>
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <p className="flex items-center gap-2 text-sm font-medium">
                                                    <KeyRound className="h-4 w-4" /> Password
                                                </p>
                                                {!changingPassword && (
                                                    <Button size="sm" variant="outline" onClick={() => setChangingPassword(true)}>
                                                        Change password
                                                    </Button>
                                                )}
                                            </div>
                                            {changingPassword && (
                                                <div className="mt-4 max-w-sm">
                                                    <NewPasswordForm
                                                        checkPolicy={passwordPolicyProblem}
                                                        submitLabel="Change password"
                                                        errorTitle="Couldn't change your password"
                                                        onSubmit={async (password) => {
                                                            try {
                                                                await changePassword(user, password);
                                                            } catch (err) {
                                                                throw new Error(friendlyFirebaseError(err, "Couldn't change your password."));
                                                            }
                                                            afterChange("Password changed", "Every other device has been signed out.");
                                                        }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        <section className="rounded-2xl border border-border/60 bg-panel/70 p-5 backdrop-blur">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Sessions</p>
                                    <h2 className="mt-1 text-lg font-semibold">Sign out everywhere</h2>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Ends every session on every device, this one included. Use it if you signed in somewhere you shouldn't have
                                        stayed signed in, or think someone else has access.
                                    </p>
                                </div>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="outline" className="gap-1.5" disabled={isSigningOutEverywhere}>
                                            {isSigningOutEverywhere ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                                            Sign out everywhere
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Sign out of every device?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                You'll need to sign in again here and everywhere else. Other devices lose access within a minute.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => void signOutEverywhere()}>Sign out everywhere</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </section>

                        <section className="rounded-2xl border border-border/60 bg-panel/70 p-5 backdrop-blur">
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Recent activity</p>
                            <p className="mt-1 text-xs text-muted-foreground">Your last 8 sign-in and security events.</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                Anything you don't recognise? Change your password and sign out everywhere.
                            </p>
                            {eventsError ? (
                                <p className="mt-4 text-sm text-destructive">{eventsError}</p>
                            ) : events === null ? (
                                <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                                </p>
                            ) : events.length === 0 ? (
                                <p className="mt-4 text-sm text-muted-foreground">Nothing recorded yet.</p>
                            ) : (
                                <ul className="mt-4 divide-y divide-border/50">
                                    {events.slice(0, 8).map((event) => (
                                        <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
                                            <span className={event.type === "SIGN_IN_REJECTED" ? "text-sm text-destructive" : "text-sm"}>
                                                {EVENT_LABELS[event.type] ?? event.type}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {describeDevice(event.userAgent)}
                                                {event.ipAddress ? ` · ${event.ipAddress}` : ""} ·{" "}
                                                <time dateTime={event.createdAt} title={new Date(event.createdAt).toLocaleString()}>
                                                    {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                                                </time>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                </main>
            </div>

            <AppSidebar sidebar={sidebar} />
            <ConfirmIdentityDialog open={confirmOpen} onOpenChange={setConfirmOpen} onConfirmed={onConfirmed} />
        </div>
    );
}
