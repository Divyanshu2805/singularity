package com.java.vibecraft.dto.auth;

public record UserProfileResponse(
        Long id,
        String username,
        String name
) {
}
