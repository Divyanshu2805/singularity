package com.singularity.common.dto;

import java.util.List;
import java.util.Map;

/**
 * The outcome of a revision publish, as it crosses workspace-service's internal API.
 *
 * <p>Handles: telling the caller whether every changed path actually landed (APPLIED), or none of them did (FAILED -
 * a storage/validation problem, safe to retry; CONFLICT - the caller's {@code expectedParentRevisionId} was stale,
 * safe to retry after re-reading {@code currentRevisionId}). Publishing is all-or-nothing, so {@code failedPaths} is
 * either empty or the full set of changed paths - there is no partial-success case. {@code previousContent} carries
 * every changed path's content immediately before this call, replacing what used to be a separate pre-write read per
 * file.
 *
 * <p>{@code reason} is set only when a publish was refused for something the person can act on - today, a change
 * that would take the project past its size limits. It is one plain sentence meant to be shown as it is; null for
 * every other outcome, where "try again" is the honest advice.
 */
public record PublishRevisionResponse(
        Long revisionId,
        Status status,
        Long currentRevisionId,
        List<String> failedPaths,
        Map<String, String> previousContent,
        String reason
) {
    public enum Status { APPLIED, FAILED, CONFLICT }

    public PublishRevisionResponse(Long revisionId, Status status, Long currentRevisionId,
                                   List<String> failedPaths, Map<String, String> previousContent) {
        this(revisionId, status, currentRevisionId, failedPaths, previousContent, null);
    }
}
