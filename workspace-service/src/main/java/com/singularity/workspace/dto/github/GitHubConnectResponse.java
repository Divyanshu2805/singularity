package com.singularity.workspace.dto.github;

/**
 * Where to send the browser so its owner can agree, on GitHub, to the connection.
 *
 * <p>Handles: the one address, which already holds the signed value GitHub will hand back.
 */
public record GitHubConnectResponse(String url) {
}
