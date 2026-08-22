package com.vibecraft.common.dto;

import java.util.List;

/**
 * A whole change set to publish atomically, as it crosses workspace-service's internal API.
 *
 * <p>Handles: naming the writer (source), who's responsible, the base revision this change set was made against, and
 * every path it touches. {@code expectedParentRevisionId} is the optimistic-concurrency check: publishing fails with
 * CONFLICT if the project's current revision has moved on since the caller last read it. Null means "no expectation"
 * - today's only caller (the AI generation pipeline) has no real conflict to check, since only one generation ever
 * runs per project at a time, but a future writer (a manual editor) reads a file's current revision id and passes it
 * back here to keep a stale tab from overwriting newer content.
 */
public record PublishRevisionRequest(
        Long expectedParentRevisionId,
        Long createdByUserId,
        String source,
        List<FileChangeDto> changes
) {
}
