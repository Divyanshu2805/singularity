package com.singularity.workspace.dto.revision;

import com.singularity.workspace.enums.RevisionSource;
import com.singularity.workspace.enums.RevisionStatus;

import java.time.Instant;
import java.util.List;

/**
 * One entry in a project's revision history, as the workspace's History panel lists it.
 *
 * <p>Handles: what made the revision, who, when, whether it landed, the revision it was made on top of - which is
 * what undoing it restores - and the paths it changed, so an entry can say "3 files" and name them.
 */
public record RevisionSummaryResponse(
        Long id,
        Long parentRevisionId,
        RevisionStatus status,
        RevisionSource source,
        Long createdByUserId,
        Instant createdAt,
        Instant appliedAt,
        List<String> changedPaths,
        Long restoredRevisionId,
        Boolean restoredBefore
) {
}
