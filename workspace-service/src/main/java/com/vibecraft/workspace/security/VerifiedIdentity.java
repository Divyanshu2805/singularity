package com.vibecraft.workspace.security;

import java.time.Instant;

/**
 * What a verified Firebase ID token or session cookie vouches for.
 *
 * @param signInProvider   {@code password}, {@code google.com}, ...
 * @param secondFactorUsed true when the sign-in completed a second factor (TOTP)
 * @param authTime         when the person actually signed in, as opposed to when this token was refreshed
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
