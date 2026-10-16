package com.singularity.common.security;

import java.time.Duration;

/**
 * The only door to Firebase Authentication.
 *
 * <p>Handles: the operations session handling needs - verify an ID token fresh from the browser, verify one of
 * this app's session cookies, decode a cookie offline without a revocation check or a network call, mint a session
 * cookie, revoke every session of a user, delete a user when their account is deleted, and make the shared demo
 * user again from nothing each day (DemoAccount).
 *
 * <p>An interface so the session logic can be tested without Google's servers. Every method throws
 * BadCredentialsException for a credential that is invalid, expired, revoked or belongs to a disabled user, and
 * ExternalServiceException when Firebase itself cannot be reached - callers depend on that distinction to fail closed
 * rather than open.
 */
public interface IdentityVerifier {

    VerifiedIdentity verifyIdToken(String idToken);

    VerifiedIdentity verifySessionCookie(String sessionCookie);

    VerifiedIdentity decodeSessionCookieOffline(String sessionCookie);

    String createSessionCookie(String idToken, Duration maxAge);

    void revokeAllSessions(String uid);

    void deleteUser(String uid);

    void recreateUser(String uid, String email, String password, String displayName);
}
