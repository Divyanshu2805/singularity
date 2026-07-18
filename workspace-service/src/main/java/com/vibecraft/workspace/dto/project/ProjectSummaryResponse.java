package com.vibecraft.workspace.dto.project;

import com.vibecraft.workspace.enums.ProjectRole;

import java.time.Instant;

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
