package com.vibecraft.account.dto.auth;

public record AuthResponse(
        String token,
        UserProfileResponse user
) {
}
