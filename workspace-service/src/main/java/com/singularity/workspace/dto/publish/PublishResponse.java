package com.singularity.workspace.dto.publish;

import java.time.Instant;

/**
 * Where a project's published app stands, for the Publish panel and for anyone who opens the project.
 *
 * <p>Handles: whether the app is live and at what link, the link's name, when the live build was made, whether the
 * project has changed since (so the panel can offer Update), whether its code is shared, the build under way or the
 * last one that failed, and - for a project never published - the name the link would get.
 *
 * <p>{@code slug} is null only for a project that has never been published; an unpublished one keeps its name, with
 * {@code live} false. {@code suggestedSlug} is set only when there is no slug yet.
 */
public record PublishResponse(
        boolean live,
        String url,
        String slug,
        String suggestedSlug,
        Instant publishedAt,
        boolean hasChanges,
        boolean shared,
        PublishBuild build
) {
}
