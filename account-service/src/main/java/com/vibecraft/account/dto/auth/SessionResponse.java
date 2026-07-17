package com.vibecraft.account.dto.auth;

import java.time.Instant;

/**
 * @param expiresAt        when the session cookie expires - the client keeps it only as a hint for routing, since it
 *                         can't read the httpOnly cookie itself
 * @param newAccount       true when this sign-in created the account
 * @param secondFactorUsed false means the account signed in with one factor, so the client can suggest adding one
 */
public record SessionResponse(
        UserProfileResponse user,
        Instant expiresAt,
        boolean newAccount,
        boolean secondFactorUsed
) {
}
