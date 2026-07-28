package com.vibecraft.account.dto.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * The Firebase ID token the browser exchanges for a session cookie.
 *
 * <p>Handles: carrying and bounding that token. The size cap is what keeps an oversized body from reaching the
 * verifier at all.
 */
public record CreateSessionRequest(

        @NotBlank(message = "ID token is required")
        @Size(max = 8192, message = "ID token is too long")
        String idToken
) {
}
