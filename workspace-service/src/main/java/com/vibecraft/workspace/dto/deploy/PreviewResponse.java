package com.vibecraft.workspace.dto.deploy;

import com.vibecraft.workspace.enums.PreviewStatus;

import java.time.Instant;

/**
 * A project's live preview as the Preview tab renders it.
 *
 * <p>Handles: the status and the step or reason behind it, the URL (known from the start, since the hostname is
 * decided up front, but only answering once the status is running), the lifecycle timestamps, when inactivity will
 * stop it, and whether this caller may stop it.
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
        boolean canStop
) {
}
