package com.vibecraft.workspace.service;

import com.vibecraft.common.dto.PublishRevisionResponse;
import com.vibecraft.workspace.dto.revision.RevisionPreviewResponse;
import com.vibecraft.workspace.dto.revision.RevisionSummaryResponse;

import java.util.List;
import java.util.Map;

/**
 * Reads a project's revision history and restores to one of them.
 *
 * <p>Handles: listing revisions most recent first, previewing what restoring to one would change without touching
 * anything, reconstructing a revision's full path-to-content-hash snapshot for any caller that needs it (CODE_REVIEW.md
 * AI-09's build validator, among others), and restoring - which is not a special code path, it computes the diff
 * between the target revision's reconstructed snapshot and the project's current state and publishes that diff
 * through {@link RevisionPublisher} like any other writer (ADDITIONALS.md MID-03's "restoring code never falsely
 * claims to roll back live database changes" - it always creates a new forward-only revision, never rewrites
 * history).
 */
public interface RevisionService {

    List<RevisionSummaryResponse> listRevisions(Long projectId);

    RevisionPreviewResponse preview(Long projectId, Long revisionId);

    /**
     * path -> content hash, for every path that exists (not deleted) as of the given revision. Works for a
     * not-yet-published {@code STAGING} revision exactly as it does for an {@code APPLIED} one - the underlying
     * recursive query has no status filter, and by the time any caller can reach a revision id, its manifest rows
     * are already durably committed (see {@code RevisionPublisherImpl}'s publish sequencing).
     */
    Map<String, String> snapshot(Long revisionId);

    PublishRevisionResponse restore(Long projectId, Long revisionId, Long userId);
}
