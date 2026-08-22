package com.vibecraft.workspace.service;

import com.vibecraft.common.dto.PublishRevisionRequest;
import com.vibecraft.common.dto.PublishRevisionResponse;

/**
 * Publishes a whole change set as one atomic unit (CODE_REVIEW.md AI-05 / CODE_TODO.md GATE-02).
 *
 * <p>Handles: staging every changed path's content immutably, recording the change set as a durable manifest,
 * applying it to the project's live file layout, and atomically advancing the project's current revision - all or
 * nothing. A failure at any point after staging leaves the project on its previous revision, with every
 * already-applied path in this same call rolled back before returning. Every writer - the AI generation pipeline
 * today, a future manual editor or restore - publishes through this one path, so "manual and AI changes share
 * revision history" (ADDITIONALS.md MID-04) needs no separate mechanism later.
 */
public interface RevisionPublisher {

    PublishRevisionResponse publish(Long projectId, PublishRevisionRequest request);
}
