package com.vibecraft.account.dto.auth;

/**
 * The signed-in user as the app shows them.
 *
 * <p>Handles: the id, the username (their email) and the display name. Nothing security-relevant is exposed here.
 */
public record UserProfileResponse(
        Long id,
        String username,
        String name
) {
}
