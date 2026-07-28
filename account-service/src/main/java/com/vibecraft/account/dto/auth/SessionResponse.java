package com.vibecraft.account.dto.auth;

import java.time.Instant;

/**
 * What the browser learns when a session starts.
 *
 * <p>Handles: the signed-in profile, when the cookie expires (a hint for routing only, since the client cannot read
 * the httpOnly cookie itself), whether this sign-in created the account, and whether a second factor was used - so
 * the client can suggest adding one.
 */
public record SessionResponse(
        UserProfileResponse user,
        Instant expiresAt,
        boolean newAccount,
        boolean secondFactorUsed
) {
}
