package com.singularity.workspace.dto.project;

import com.singularity.workspace.enums.ProjectRole;

import java.time.Instant;

/**
 * One project as the dashboard and sidebar list it.
 *
 * <p>Handles: the line saying what the app is, which the sidebar shows in place of the name (null on an older project), when the project's picture was last taken (null while its card should keep its colours), the identity and timestamps, the caller's role, their own pin and star markers - which are
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
