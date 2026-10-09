package com.singularity.workspace.dto.deploy;

import com.singularity.workspace.enums.PreviewFailureKind;
import com.singularity.workspace.enums.PreviewStatus;
import com.singularity.workspace.enums.PreviewSyncState;

import java.time.Instant;

/**
 * A project's live preview as the Preview tab renders it.
 *
 * <p>Handles: the status and the step or reason behind it, the URL (known from the start, since the hostname is
 * decided up front, but only answering once the status is running), the lifecycle timestamps, when inactivity will
 * stop it, whether this caller may stop it, what kind of thing a failed start died of, the caller's place in the
 * line while every runner is busy (1 is next), and whether a running preview is showing the project's current
 * files or still taking a change in - with the step under way when it is.
 *
 * <p>The project name is set only on the caller's cross-project list, where rows span projects.
 */
public record PreviewResponse(
        Long id,
        Long projectId,
        String projectName,
        PreviewStatus status,
        String previewUrl,
        String detail,
        Instant startedAt,
        Instant readyAt,
        Instant terminatedAt,
        Instant stopsAt,
        boolean canStop,
        PreviewFailureKind failureKind,
        Integer queuePosition,
        PreviewSyncState syncState,
        String syncDetail,
        Long syncedRevisionId
) {
}
