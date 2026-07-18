package com.vibecraft.workspace.security;

import java.time.Duration;

/**
 * The only door to Firebase Authentication. An interface so the session logic can be tested without Google's servers.
 *
 * <p>Every method throws {@link org.springframework.security.authentication.BadCredentialsException} for a token that
 * is invalid, expired, revoked, or belongs to a disabled user, and
 * {@link com.vibecraft.common.error.ExternalServiceException} when Firebase itself can't be reached.
 */
public interface IdentityVerifier {

    /** Verifies an ID token fresh from the browser, including that its sessions haven't been revoked. */
    VerifiedIdentity verifyIdToken(String idToken);

    /** Verifies one of this app's session cookies, including revocation. A network call - cache the result. */
    VerifiedIdentity verifySessionCookie(String sessionCookie);

    /** Signature and expiry only, no revocation check and no network - for sign-out, where a revoked cookie is fine. */
    VerifiedIdentity decodeSessionCookieOffline(String sessionCookie);

    String createSessionCookie(String idToken, Duration maxAge);

    /** Ends every session the user has, on every device. */
    void revokeAllSessions(String uid);
}
