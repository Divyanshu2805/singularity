package com.java.vibecraft.dto.auth;

public record AuthResponse(
        String token,
        UserProfileResponse user
) {

}
