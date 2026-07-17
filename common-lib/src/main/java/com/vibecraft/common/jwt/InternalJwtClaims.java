package com.vibecraft.common.jwt;

/** The caller, as every downstream service sees it once {@code JwtAuthFilter} has verified the internal JWT. */
public record InternalJwtClaims(
        Long userId,
        String username
) {
}
