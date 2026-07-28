package com.vibecraft.workspace.service;

import com.vibecraft.workspace.dto.deploy.PreviewLogsResponse;
import com.vibecraft.workspace.dto.deploy.PreviewResponse;

import java.util.List;
import java.util.Optional;

/**
 * Live previews: a project's files running in a Vite dev server, reachable at a URL of their own.
 *
 * <p>Handles: opening a project's preview for the caller - joining the runner a collaborator already has going, or
 * starting one - reading it, restarting the dev server in place, closing the caller's own session, reading the
 * runner's output, listing the caller's open previews, counting them for the plan allowance, and stopping every
 * preview of a project when the project itself is deleted.
 *
 * <p>Starting returns while the preview is still coming up; the caller polls. The shared runner stops only once
 * nobody has it open.
 */
public interface PreviewDeploymentService {

    PreviewResponse startPreview(Long projectId);

    Optional<PreviewResponse> getPreview(Long projectId);

    PreviewResponse restartPreview(Long projectId);

    void stopPreview(Long projectId);

    PreviewLogsResponse getPreviewLogs(Long projectId);

    List<PreviewResponse> getMyActivePreviews();

    int countActivePreviews(Long userId);

    void stopAllForProject(Long projectId, String reason);
}
