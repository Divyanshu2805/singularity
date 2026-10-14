package com.singularity.account.dto.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * A request to delete the signed-in account.
 *
 * <p>Handles: an ID token fresh from signing in again, which must belong to the signed-in user and be minutes old -
 * so a session cookie alone, from a device left signed in, can never delete an account.
 */
public record DeleteAccountRequest(

        @NotBlank(message = "ID token is required")
        @Size(max = 8192, message = "ID token is too long")
        String idToken
) {
}
