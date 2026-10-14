package com.singularity.workspace.dto.project;

import com.singularity.workspace.enums.ProjectRole;

import java.time.Instant;

/**
 * One project as the dashboard and sidebar list it.
 *
 * <p>Handles: the project's title - the summary, which the sidebar, the card and search show in place of the name, and
 * null until a model or a rename has written one - when the project's picture was last taken (null while its card
 * should keep its colours), the identity and timestamps, the caller's role, their own pin and star markers - which are
 * per-member, not per-project - and the link of the project's published app when it has one live, which every member
 * sees alike.
 */
public record ProjectSummaryResponse(
        Long id,
        String name,
        String summary,
        ProjectRole role,
        Instant createdAt,
        Instant updatedAt,
        Instant pinnedAt,
        Instant starredAt,
        String publishedUrl,
        Instant thumbnailAt
) {
}
