package com.singularity.workspace.dto.publish;

import java.time.Instant;

/**
 * A shared app, as its public page describes it.
 *
 * <p>Handles: the project's name, the link name and URL of the live app, when it was published, and how many files its
 * shared code has. Nothing about who owns it, who else is a member, or its chat.
 */
public record PublicAppResponse(
        String name,
        String slug,
        String url,
        Instant publishedAt,
        int fileCount
) {
}
