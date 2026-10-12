package com.singularity.workspace.dto.github;

import java.time.Instant;
import java.util.List;

/**
 * Where a project stands with GitHub, for the person asking.
 *
 * <p>Handles: whether the feature is on and whether this person has connected GitHub, the repository the project has
 * been pushed to if any - its name, address and visibility - when it was last pushed and whether the project has
 * changed since, a name to offer for a first push, and the files the last push left out on purpose.
 */
public record ProjectGitHubResponse(
        boolean available,
        boolean connected,
        String login,
        boolean linked,
        String fullName,
        String url,
        Boolean privateRepo,
        Instant lastPushedAt,
        boolean hasChanges,
        String suggestedName,
        List<String> leftOut
) {
}
