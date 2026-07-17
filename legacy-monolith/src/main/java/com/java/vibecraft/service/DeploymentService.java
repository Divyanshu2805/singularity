package com.java.vibecraft.service;

import com.java.vibecraft.dto.deploy.PreviewLogsResponse;
import com.java.vibecraft.dto.deploy.PreviewResponse;

import java.util.List;
import java.util.Optional;

/** Live previews: a project's files running in a Vite dev server, reachable at a URL of their own. */
public interface DeploymentService {

    /**
     * Opens the project's preview for the caller: joins the runner if a collaborator already has one going, otherwise
     * starts it. Returns while it is still CREATING - poll {@link #getPreview}. Counts against the caller's plan.
     */
    PreviewResponse startPreview(Long projectId);

    /**
     * The caller's own preview of the project - running only if they started or joined it, whatever a collaborator
     * is doing - or empty if they never have. Counts as a visit.
     */
    Optional<PreviewResponse> getPreview(Long projectId);

    /** Reinstalls and restarts the dev server in the same runner (after a dependency change), or starts one. */
    PreviewResponse restartPreview(Long projectId);

    /** Closes the caller's preview. The shared runner stops only once nobody has it open. */
    void stopPreview(Long projectId);

    PreviewLogsResponse getPreviewLogs(Long projectId);

    /** The previews the caller has open, across projects - what their plan's allowance is spent on. */
    List<PreviewResponse> getMyActivePreviews();

    /** How many previews this user has open. A collaborator's preview on a shared project doesn't count. */
    int countActivePreviews(Long userId);

    /** Stops every preview of a project, without an authorization check - for when the project itself is deleted. */
    void stopAllForProject(Long projectId, String reason);
}
