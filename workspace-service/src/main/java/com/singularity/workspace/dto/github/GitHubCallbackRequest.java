package com.singularity.workspace.dto.github;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * What GitHub sent the browser back with after a person agreed to the connection.
 *
 * <p>Handles: the one-use code to exchange for a token, and the signed value this service made when the sign-in began.
 */
public record GitHubCallbackRequest(
        @NotBlank(message = "The code from GitHub is missing")
        @Size(max = 200, message = "The code from GitHub is too long")
        String code,
        @NotBlank(message = "The state from GitHub is missing")
        @Size(max = 200, message = "The state from GitHub is too long")
        String state
) {
}
