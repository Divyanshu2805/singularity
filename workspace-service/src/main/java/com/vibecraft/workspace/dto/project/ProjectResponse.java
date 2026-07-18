package com.vibecraft.workspace.dto.project;

import com.vibecraft.workspace.enums.ProjectRole;

import java.time.Instant;

public record ProjectResponse(
        Long id,
        String name,
        ProjectRole role,
        Instant createdAt,
        Instant updatedAt,
        String templateInitIssue,
        /** Set when this project is a fork - the id of the project it was copied from. */
        Long forkedFromProjectId
) {
}
