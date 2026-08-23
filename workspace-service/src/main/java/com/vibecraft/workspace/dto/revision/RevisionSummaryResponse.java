package com.vibecraft.workspace.dto.revision;

import com.vibecraft.workspace.enums.RevisionSource;
import com.vibecraft.workspace.enums.RevisionStatus;

import java.time.Instant;

/**
 * One entry in a project's revision history - what MID-03's checkpoint list will eventually render.
 */
public record RevisionSummaryResponse(
        Long id,
        Long parentRevisionId,
        RevisionStatus status,
        RevisionSource source,
        Long createdByUserId,
        Instant createdAt,
        Instant appliedAt
) {
}
