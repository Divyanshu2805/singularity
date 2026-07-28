package com.vibecraft.workspace.dto.project;

import com.vibecraft.workspace.enums.ProjectRole;

import java.time.Instant;

/**
 * One project as the dashboard and sidebar list it.
 *
 * <p>Handles: the identity and timestamps, the caller's role, and their own pin and star markers - which are
 * per-member, not per-project.
 */
public record ProjectSummaryResponse(
        Long id,
        String name,
        ProjectRole role,
        Instant createdAt,
        Instant updatedAt,
        Instant pinnedAt,
        Instant starredAt
) {
}
