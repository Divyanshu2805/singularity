package com.java.vibecraft.dto.project;

import com.java.vibecraft.enums.ProjectRole;

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
