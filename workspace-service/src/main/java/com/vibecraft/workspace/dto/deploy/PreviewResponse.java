package com.vibecraft.workspace.dto.deploy;

import com.vibecraft.workspace.enums.PreviewStatus;

import java.time.Instant;

/**
 * A project's live preview as the Preview tab renders it.
 *
 * @param projectName set only on the caller's list of running previews, where rows span projects
 * @param previewUrl  where it is served. Known from the start (the hostname is decided up front), but it only
 *                    answers once {@code status} is RUNNING
 * @param detail      the step in progress while CREATING; why it ended once FAILED or TERMINATED
 * @param stopsAt     when it will be stopped for inactivity if nobody looks at it again - RUNNING only
 * @param canStop     whether the caller may stop it: whoever started it, or anyone who can edit the project
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
