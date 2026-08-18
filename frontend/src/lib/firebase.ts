/**
 * The Firebase app and Auth instance, created on first use.
 *
 * Handles: the web config - none of it secret, since it only identifies the project and access is governed by
 * authorized domains and the backend's token checks - the Google provider, and turning a Firebase error code into a
 * readable sentence.
 *
 * An unrecognised code is appended to the fallback rather than dropped, so a cause this switch does not name yet is
 * still diagnosable from the UI. The code is only read when it is actually a string: an ApiRequestError declares a
 * code property that is usually undefined, and treating that as present once made every backend failure during the
 * sign-in exchange - a spent quota, an unverified email, a stale sign-in - read as the generic provider error.
 *
 * Persistence is in-memory on purpose: Firebase's default keeps a refresh token in browser storage, where any script
 * on the page could read it. This app's own session is an httpOnly cookie instead, so the Firebase user is needed
 * only long enough to mint it.
 */
import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  inMemoryPersistence,
  initializeAuth,
  initializeRecaptchaConfig,
  type Auth,
} from "firebase/auth";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (!config.apiKey || !config.authDomain || !config.projectId) {
    throw new Error("Firebase sign-in isn't configured. Set VITE_FIREBASE_* in frontend/.env.local.");
  }
  if (!auth) {
    app = initializeApp(config);
    auth = initializeAuth(app, {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
    initializeRecaptchaConfig(auth).catch(() => undefined);
  }
  return auth;
}

export function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

export function friendlyFirebaseError(error: unknown, fallback: string): string {
  const raw = typeof error === "object" && error && "code" in error ? (error as { code: unknown }).code : undefined;
  const code = typeof raw === "string" ? raw : "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "That email and password don't match. Double-check them and try again.";
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try signing in instead.";
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      return "That password isn't strong enough. Use at least 8 characters with a mix of letters, numbers and symbols.";
    case "auth/invalid-email":
      return "That doesn't look like an email address.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes before trying again.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact support if you think that's a mistake.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "The Google window was closed before signing in finished.";
    case "auth/popup-blocked":
      return "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.";
    case "auth/account-exists-with-different-credential":
      return "This email already has an account with a different sign-in method. Sign in that way first.";
    case "auth/invalid-verification-code":
    case "auth/invalid-verification-id":
      return "That code isn't right. Check your authenticator app and try again.";
    case "auth/requires-recent-login":
      return "For your security, confirm it's you again, then retry.";
    case "auth/expired-action-code":
      return "This link has expired. Request a new one.";
    case "auth/invalid-action-code":
      return "This link is invalid or has already been used. Request a new one.";
    case "auth/network-request-failed":
      return "Couldn't reach the sign-in service. Check your connection and try again.";
    case "auth/unverified-email":
      return "Verify your email address first - check your inbox for the link.";
    default:
      if (!code) return error instanceof Error && error.message ? error.message : fallback;
      return `${fallback} (${code})`;
  }
}
