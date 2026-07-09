import {
  EmailAuthProvider,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  getMultiFactorResolver,
  multiFactor,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  TotpMultiFactorGenerator,
  updatePassword,
  updateProfile,
  validatePassword,
  verifyPasswordResetCode,
  type MultiFactorInfo,
  type MultiFactorResolver,
  type TotpSecret,
  type User,
  type UserCredential,
} from "firebase/auth";
import { api, renewSession, startSession } from "./api";
import { getFirebaseAuth, googleProvider } from "./firebase";
import type { AuthSecurityEventType, SessionResponse } from "./types";

/**
 * Every sign-in flow, built on one rule: the Firebase user is a means to a session cookie and nothing more. It exists
 * between "Firebase accepted the credentials" and "the backend set the cookie", then it's signed out.
 */

export type SignInOutcome =
  | { kind: "signed-in"; session: SessionResponse }
  /** The account has a second factor: ask for the code, then call `completeSecondFactor`. */
  | { kind: "second-factor"; resolver: MultiFactorResolver }
  /** A password account whose email isn't verified yet: nothing gets a session until it is. */
  | { kind: "verify-email"; email: string };

const ISSUER = "VibeCraft";

/** Where Firebase's emails send people back to. Only used if the console's custom action URL isn't set. */
const continueUrl = () => ({ url: `${window.location.origin}/login` });

function isSecondFactorRequired(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "auth/multi-factor-auth-required";
}

/** Hands a Firebase sign-in to the backend and lets go of it. */
async function exchangeForSession(user: User): Promise<SessionResponse> {
  try {
    const session = await api.createSession(await user.getIdToken());
    startSession(session);
    return session;
  } finally {
    await firebaseSignOut(getFirebaseAuth()).catch(() => undefined);
  }
}

async function finishSignIn(credential: UserCredential): Promise<SignInOutcome> {
  const { user } = credential;
  if (!user.emailVerified) {
    // Send a fresh link: the reason they're here is usually that the first one got lost.
    await sendEmailVerification(user, continueUrl()).catch(() => undefined);
    const email = user.email ?? "";
    await firebaseSignOut(getFirebaseAuth()).catch(() => undefined);
    return { kind: "verify-email", email };
  }
  return { kind: "signed-in", session: await exchangeForSession(user) };
}

async function attempt(signIn: () => Promise<UserCredential>): Promise<SignInOutcome> {
  try {
    return await finishSignIn(await signIn());
  } catch (error) {
    if (isSecondFactorRequired(error)) {
      return { kind: "second-factor", resolver: getMultiFactorResolver(getFirebaseAuth(), error as never) };
    }
    throw error;
  }
}

export const signInWithPassword = (email: string, password: string) =>
  attempt(() => signInWithEmailAndPassword(getFirebaseAuth(), email, password));

export const signInWithGoogle = () => attempt(() => signInWithPopup(getFirebaseAuth(), googleProvider()));

/** True if this account has an authenticator app to ask for. */
export const hasTotpFactor = (resolver: MultiFactorResolver) =>
  resolver.hints.some((hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID);

export async function completeSecondFactor(resolver: MultiFactorResolver, code: string): Promise<SignInOutcome> {
  const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  if (!hint) throw new Error("This account's second factor isn't an authenticator app, which this app doesn't support yet.");
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.replace(/\s+/g, ""));
  return finishSignIn(await resolver.resolveSignIn(assertion));
}

/**
 * Creates the Firebase account and emails a verification link. No session yet: an unverified address could be
 * anyone's, so the account can't be used until the link is clicked.
 */
export async function signUpWithPassword(name: string, email: string, password: string): Promise<void> {
  const auth = getFirebaseAuth();
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  try {
    await updateProfile(user, { displayName: name });
    await sendEmailVerification(user, continueUrl());
  } finally {
    await firebaseSignOut(auth).catch(() => undefined);
  }
}

/**
 * The project's password policy (Identity Platform), checked before a round trip. Returns the first unmet
 * requirement as a sentence, or null. Firebase enforces the same policy server-side regardless.
 */
export async function passwordPolicyProblem(password: string): Promise<string | null> {
  try {
    const status = await validatePassword(getFirebaseAuth(), password);
    if (status.isValid) return null;
    if (status.meetsMinPasswordLength === false) return `Use at least ${status.passwordPolicy.customStrengthOptions.minPasswordLength ?? 8} characters`;
    if (status.meetsMaxPasswordLength === false) return "That password is too long";
    if (status.containsLowercaseLetter === false) return "Add a lowercase letter";
    if (status.containsUppercaseLetter === false) return "Add an uppercase letter";
    if (status.containsNumericCharacter === false) return "Add a number";
    if (status.containsNonAlphanumericCharacter === false) return "Add a symbol";
    return "That password doesn't meet the requirements";
  } catch {
    // The policy couldn't be fetched - Firebase still enforces it when the password is actually set.
    return null;
  }
}

/** Always resolves the same way, whether or not the address has an account (with email enumeration protection on). */
export async function sendResetEmail(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(getFirebaseAuth(), email, continueUrl());
  } catch (error) {
    const code = (error as { code?: string }).code;
    // Without enumeration protection Firebase says so outright - swallow it, so the page can't be used to probe.
    if (code !== "auth/user-not-found") throw error;
  }
}

/** For the reset page: which account a reset link is for, and whether the link still works. */
export const checkResetCode = (oobCode: string) => verifyPasswordResetCode(getFirebaseAuth(), oobCode);

export const applyResetCode = (oobCode: string, newPassword: string) =>
  confirmPasswordReset(getFirebaseAuth(), oobCode, newPassword);

// ---------------------------------------------------------------------------------------------------------------
// Security settings. Everything below changes the account, so it runs against a *just re-authenticated* Firebase
// user - never a remembered one - and refreshes the session afterwards, because Firebase revokes existing sessions
// when a password or second factor changes.
// ---------------------------------------------------------------------------------------------------------------

export type ReauthOutcome = { kind: "ready"; user: User } | { kind: "second-factor"; resolver: MultiFactorResolver };

async function reauthAttempt(run: () => Promise<UserCredential>): Promise<ReauthOutcome> {
  try {
    return { kind: "ready", user: (await run()).user };
  } catch (error) {
    if (isSecondFactorRequired(error)) {
      return { kind: "second-factor", resolver: getMultiFactorResolver(getFirebaseAuth(), error as never) };
    }
    throw error;
  }
}

/** Confirms it's really them with their password. Signs into Firebase first - the SDK holds nobody between visits. */
export const confirmWithPassword = (email: string, password: string) =>
  reauthAttempt(async () => {
    const auth = getFirebaseAuth();
    if (auth.currentUser?.email === email) {
      return reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(email, password));
    }
    return signInWithEmailAndPassword(auth, email, password);
  });

export const confirmWithGoogle = () =>
  reauthAttempt(async () => {
    const auth = getFirebaseAuth();
    if (auth.currentUser) return reauthenticateWithPopup(auth.currentUser, googleProvider());
    return signInWithPopup(auth, googleProvider());
  });

export async function confirmSecondFactor(resolver: MultiFactorResolver, code: string): Promise<User> {
  const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  if (!hint) throw new Error("This account's second factor isn't an authenticator app.");
  const credential = await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.replace(/\s+/g, "")));
  return credential.user;
}

/** The signed-in email's sign-in methods, e.g. to hide "change password" from a Google-only account. */
export const providerIds = (user: User) => user.providerData.map((p) => p.providerId);

export const enrolledFactors = (user: User): MultiFactorInfo[] => multiFactor(user).enrolledFactors;

export async function startTotpEnrollment(user: User): Promise<{ secret: TotpSecret; qrUrl: string }> {
  const session = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  return { secret, qrUrl: secret.generateQrCodeUrl(user.email ?? "account", ISSUER) };
}

/** Swaps the now-revoked session for a fresh one and records what changed. */
async function refreshSessionAfter(user: User, event: AuthSecurityEventType): Promise<SessionResponse> {
  const idToken = await user.getIdToken(true);
  const session = await api.createSession(idToken);
  renewSession(session);
  await api.reportSecurityEvent(event, idToken).catch(() => undefined);
  return session;
}

export async function finishTotpEnrollment(user: User, secret: TotpSecret, code: string): Promise<void> {
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code.replace(/\s+/g, ""));
  await multiFactor(user).enroll(assertion, "Authenticator app");
  await refreshSessionAfter(user, "MFA_ENROLLED");
}

export async function removeFactor(user: User, factor: MultiFactorInfo): Promise<void> {
  await multiFactor(user).unenroll(factor);
  await refreshSessionAfter(user, "MFA_REMOVED");
}

export async function changePassword(user: User, newPassword: string): Promise<void> {
  await updatePassword(user, newPassword);
  await refreshSessionAfter(user, "PASSWORD_CHANGED");
}

/** Lets go of a re-authenticated Firebase user when the settings dialog closes. */
export const releaseFirebaseUser = () => firebaseSignOut(getFirebaseAuth()).catch(() => undefined);
