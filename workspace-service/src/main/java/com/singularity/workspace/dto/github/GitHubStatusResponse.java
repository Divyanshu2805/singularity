package com.singularity.workspace.dto.github;

/**
 * Whether the signed-in person can use GitHub here, and whether they have connected it.
 *
 * <p>Handles: saying that the feature is switched on for this deployment, that this person has a connection, and
 * which GitHub account it is. It never carries the token.
 */
public record GitHubStatusResponse(boolean available, boolean connected, String login) {
}
