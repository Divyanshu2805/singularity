package com.vibecraft.account.dto.auth;

public record UserProfileResponse(
        Long id,
        String username,
        String name
) {
}
