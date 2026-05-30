package com.java.vibecraft.dto.project;

import com.java.vibecraft.enums.ProjectRole;

import java.time.Instant;

public record ProjectResponse(
        Long id,
        String name,
        ProjectRole role,
        Instant createdAt,
        Instant updatedAt,
        String templateInitIssue
) {
}
