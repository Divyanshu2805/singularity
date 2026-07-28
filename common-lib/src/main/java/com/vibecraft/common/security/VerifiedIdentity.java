package com.vibecraft.common.security;

import java.time.Instant;

/**
 * What a verified Firebase ID token or session cookie vouches for.
 *
 * <p>Handles: the uid, the email and whether it is verified, the display name, which provider signed the user in,
 * whether a second factor was used, when the person actually signed in as opposed to when the token was refreshed,
 * and when the credential expires.
 */
public record VerifiedIdentity(
        String uid,
        String email,
        boolean emailVerified,
        String name,
        String signInProvider,
        boolean secondFactorUsed,
        Instant authTime,
        Instant expiresAt
) {
}
