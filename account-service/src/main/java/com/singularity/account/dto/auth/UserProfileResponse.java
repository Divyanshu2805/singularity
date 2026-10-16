package com.singularity.account.dto.auth;

/**
 * The signed-in user as the app shows them.
 *
 * <p>Handles: the id, the username (their email), the display name, and whether this is the shared demo account.
 * Nothing security-relevant is exposed here: the demo account's address and password are public.
 */
public record UserProfileResponse(
        Long id,
        String username,
        String name,
        boolean demo
) {
}
