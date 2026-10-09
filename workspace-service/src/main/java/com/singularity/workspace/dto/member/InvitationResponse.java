package com.singularity.workspace.dto.member;

import com.singularity.workspace.enums.ProjectRole;

import java.time.Instant;

/**
 * An invitation as the person invited sees it.
 *
 * <p>Handles: which project it is for and its name, the role on offer, who sent it and when. The sender's name is
 * null when account-service could not resolve it; the invitation is still shown.
 */
public record InvitationResponse(
        Long projectId,
        String projectName,
        ProjectRole role,
        String invitedByName,
        Instant invitedAt
) {
}
