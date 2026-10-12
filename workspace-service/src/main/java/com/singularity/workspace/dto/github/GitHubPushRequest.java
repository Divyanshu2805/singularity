package com.singularity.workspace.dto.github;

import jakarta.validation.constraints.Size;

/**
 * How a project's repository should be made the first time it is pushed, and what a later push's commit should say.
 *
 * <p>Handles: the repository's name, and whether it is private - both optional, the name falling back to one made
 * from the project's and a repository being private unless asked otherwise, and both ignored once the project has a
 * repository - and a line saying what changed, used as the commit's message on every push after the first.
 *
 * <p>The message comes from the browser because the request that asked for a change is kept with the conversation,
 * which this service does not hold. It is the owner's own words going to the owner's own repository; the service
 * still cuts it to one short line before GitHub sees it, and says "Update from Singularity" when there is none.
 */
public record GitHubPushRequest(
        @Size(max = 100, message = "A repository name can be at most 100 characters")
        String name,
        Boolean privateRepo,
        @Size(max = 300, message = "A commit message can be at most 300 characters")
        String message
) {
}
