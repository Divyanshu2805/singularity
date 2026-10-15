/**
 * The security boxes of the Settings page: how the person signs in, and where they are signed in.
 *
 * Handles: re-authenticating before anything below can change, changing the password, enrolling and removing an
 * authenticator app, signing out everywhere, and the recent security events.
 *
 * Re-authentication is asked for up front because the provider demands a recent sign-in for these changes anyway -
 * doing it first means nobody gets halfway through a change and is then refused. Device descriptions are a rough hint
 * from the user agent, not an identity.
 *
 * It was a page of its own (/settings/security), one of three account tabs; the owner asked for the account and
 * settings to be one page of boxes, so it is drawn inside pages/Settings, and the old address leads there. The
 * boxes rise in turn with the page's others, starting from the index it is given. Its sign-in-again dialog
 * (ConfirmIdentityDialog) is also what the Delete account box asks with, told what the confirmation is for.
 */
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import QRCode from "qrcode";
import { Activity, KeyRound, Lock, LogOut, MonitorSmartphone, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import type { MultiFactorInfo, MultiFactorResolver, TotpSecret, User } from "firebase/auth";
import { AuthDialogCard, AuthDivider, AuthField, AuthSubmitButton, FormAlert, GoogleButton, PasswordField } from "@/components/auth/AuthForm";
import { NewPasswordForm } from "@/components/auth/NewPasswordForm";
import { SettingsCard } from "@/components/settings/SettingsCard";
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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { api, getUserInfo, isAuthenticated, signOut } from "@/lib/api";
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

export function ConfirmIdentityDialog({ open, onOpenChange, onConfirmed, purpose = "to change your security settings" }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirmed: (user: User) => void;
    purpose?: string;
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
            <DialogContent className="dialog-pop overflow-hidden p-0 sm:max-w-[27rem]">
                <AuthDialogCard>
                    <div className="text-center">
        <span aria-hidden="true" className="auth-medallion mx-auto mb-5">
            <ShieldCheck className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <DialogTitle className="font-display text-[26px] font-semibold leading-tight tracking-tight text-foreground">
            Confirm it's you
        </DialogTitle>
        <DialogDescription className="mx-auto mt-2 max-w-sm text-[14px] leading-6">
            {resolver ? (
                "Enter the 6-digit code from your authenticator app."
            ) : (
                <>
                    Sign in again as <span className="break-all font-medium text-foreground">{email}</span> {purpose}.
                </>
            )}
        </DialogDescription>
                    </div>

                    <div className="mt-7">
        {error && (
            <div className="mb-5">
                <FormAlert title="Not confirmed">{error}</FormAlert>
            </div>
        )}

        {resolver ? (
            <form onSubmit={submitCode} noValidate>
                <AuthField
                    id="confirm-code"
                    label="Verification code"
                    icon={Smartphone}
                    placeholder="123 456"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={7}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, ""))}
                />
                <div className="mt-7">
                    <AuthSubmitButton chip isLoading={busy === "code"} loadingText="Verifying…">
                        Verify
                    </AuthSubmitButton>
                </div>
            </form>
        ) : (
            <>
                <GoogleButton onClick={() => void handle("google", confirmWithGoogle)} isLoading={busy === "google"} disabled={busy !== null}>
                    Confirm with Google
                </GoogleButton>
                <AuthDivider label="or with your password" />
                <form
                    noValidate
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (password) void handle("password", () => confirmWithPassword(email, password));
                    }}
                >
                    <PasswordField
                        id="confirm-password"
                        label="Password"
                        icon={Lock}
                        placeholder="Your password"
                        autoComplete="current-password"
                        value={password}
                        disabled={busy !== null}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    <div className="mt-7">
                        <AuthSubmitButton chip isLoading={busy === "password"} loadingText="Confirming…">
                            Confirm
                        </AuthSubmitButton>
                    </div>
                </form>
            </>
        )}
                    </div>
                </AuthDialogCard>
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
            setError("Enter the 6-digit code your app shows for Singularity.");
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
        <div className="app-field mt-4 rounded-2xl p-4">
            {error && <div className="mb-3"><FormAlert title="Two-step verification isn't on yet">{error}</FormAlert></div>}
            {!secret ? (
                !error && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <OrbitSpinner className="h-4 w-4" /> Preparing a secret…
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
                {isSaving && <OrbitSpinner className="h-3.5 w-3.5" />}
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

export function SecuritySections({ startIndex }: { startIndex: number }) {
    const { toast } = useToast();
    const signedIn = isAuthenticated();

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
        <>
            <SettingsCard
                id="security"
                index={startIndex}
                label="Sign-in protection"
                title={<>Two-step verification &amp; password</>}
                Icon={ShieldCheck}
                description="With two-step verification, a stolen password alone isn't enough to get into your account."
                action={
                    user ? (
                        <Button variant="ghost" onClick={finishManaging}>
                            Done
                        </Button>
                    ) : (
                        <Button variant="outline" onClick={() => setConfirmOpen(true)}>
                            Manage
                        </Button>
                    )
                }
                bodyClassName={user ? "space-y-6" : undefined}
            >
                {user && (
                    <>
                        <div>
                            <p className="text-sm font-medium">Authenticator app</p>
                            {factors.length > 0 ? (
                                <ul className="mt-2 space-y-2">
                                    {factors.map((factor) => (
                                        <li key={factor.uid} className="flex items-center justify-between gap-3 app-field rounded-2xl px-3 py-2">
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
                                                {removing === factor.uid ? <OrbitSpinner className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
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
                    </>
                )}
            </SettingsCard>

            <SettingsCard
                index={startIndex + 1}
                label="Sessions"
                title="Sign out everywhere"
                Icon={MonitorSmartphone}
                description="Ends every session on every device, this one included. Use it if you signed in somewhere you shouldn't have stayed signed in, or think someone else has access."
                action={
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="outline" className="app-chip-danger gap-1.5 border-red-400/40 text-red-300" disabled={isSigningOutEverywhere}>
                                {isSigningOutEverywhere ? <OrbitSpinner className="h-3.5 w-3.5" /> : <LogOut className="h-3.5 w-3.5 text-red-500" />}
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
                }
            />

            <SettingsCard
                index={startIndex + 2}
                label="Recent activity"
                title="Your last sign-ins and security events"
                Icon={Activity}
                description="Anything you don't recognise? Change your password and sign out everywhere."
                bodyClassName="px-3 py-3 sm:px-4"
            >
                {eventsError ? (
                    <p className="px-2 py-1 text-sm text-destructive">{eventsError}</p>
                ) : events === null ? (
                    <p className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground">
                        <OrbitSpinner className="h-4 w-4" /> Loading…
                    </p>
                ) : events.length === 0 ? (
                    <p className="px-2 py-1 text-sm text-muted-foreground">Nothing recorded yet.</p>
                ) : (
                    <ul>
                        {events.slice(0, 8).map((event) => {
                            const rejected = event.type === "SIGN_IN_REJECTED";
                            return (
                                <li key={event.id} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.035]">
                                    <span
                                        aria-hidden="true"
                                        className={rejected ? "h-2 w-2 shrink-0 rounded-full bg-red-400" : "h-2 w-2 shrink-0 rounded-full bg-primary/70"}
                                    />
                                    <span className={rejected ? "min-w-0 flex-1 basis-40 text-sm font-medium text-destructive" : "min-w-0 flex-1 basis-40 text-sm font-medium"}>
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
                            );
                        })}
                    </ul>
                )}
            </SettingsCard>
            <ConfirmIdentityDialog open={confirmOpen} onOpenChange={setConfirmOpen} onConfirmed={onConfirmed} />
        </>
    );
}
