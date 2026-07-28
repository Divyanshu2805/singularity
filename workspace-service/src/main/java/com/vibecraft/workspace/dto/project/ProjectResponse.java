package com.vibecraft.workspace.dto.project;

import com.vibecraft.workspace.enums.ProjectRole;

import java.time.Instant;

/**
 * One project as its own page renders it.
 *
 * <p>Handles: the identity and timestamps, the caller's role on it, any starter-template problem still outstanding,
 * and the project it was forked from if it is a fork.
 */
public record ProjectResponse(
        Long id,
        String name,
        ProjectRole role,
        Instant createdAt,
        Instant updatedAt,
        String templateInitIssue,
        Long forkedFromProjectId
) {
}
