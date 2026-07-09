import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  inMemoryPersistence,
  initializeAuth,
  initializeRecaptchaConfig,
  type Auth,
} from "firebase/auth";

/**
 * Firebase's web config. None of it is secret - it identifies the project to the browser SDK, and access is governed
 * by the project's authorized domains and the backend's token checks - so it lives in `VITE_*` variables.
 */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

/**
 * Whether Firebase sign-in is configured. Until it is, the pages fall back to the legacy username/password flow, so
 * the app keeps working through the migration.
 */
export const firebaseEnabled = Boolean(config.apiKey && config.authDomain && config.projectId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

/**
 * The Auth instance, created on first use.
 *
 * <p>**In-memory persistence, on purpose.** Firebase's default keeps the user's refresh token in IndexedDB, where any
 * script on the page - including an injected one - can read it. Here the Firebase user exists only for the moment of
 * signing in: its ID token is exchanged for the backend's httpOnly session cookie and the user is signed out of the
 * SDK straight away. A reload forgets it, which is exactly the point.
 */
export function getFirebaseAuth(): Auth {
  if (!firebaseEnabled) throw new Error("Firebase sign-in isn't configured.");
  if (!auth) {
    app = initializeApp(config);
    auth = initializeAuth(app, {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
    // Identity Platform's reCAPTCHA protection for email/password flows. A no-op (and a harmless rejection) until
    // it's switched on in the console.
    initializeRecaptchaConfig(auth).catch(() => undefined);
  }
  return auth;
}

export function googleProvider() {
  const provider = new GoogleAuthProvider();
  // Always show the account chooser, so someone with several Google accounts picks one deliberately.
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

/** Firebase error codes as sentences a person can act on. Deliberately vague where precision would leak account existence. */
export function friendlyFirebaseError(error: unknown, fallback: string): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
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
      return error instanceof Error && error.message && !code ? error.message : fallback;
  }
}
