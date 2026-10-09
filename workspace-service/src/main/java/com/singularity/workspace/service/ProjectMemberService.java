package com.singularity.workspace.service;

import com.singularity.workspace.dto.member.InvitationResponse;
import com.singularity.workspace.dto.member.InviteMemberRequest;
import com.singularity.workspace.dto.member.MemberResponse;
import com.singularity.workspace.dto.member.UpdateMemberRoleRequest;

import java.util.List;

/**
 * A project's collaborators.
 *
 * <p>Handles: listing them, inviting an email address, the invited person listing, accepting and declining their own
 * invitations, the owner withdrawing one, changing a role and removing a member.
 */
public interface ProjectMemberService {
    List<MemberResponse> getProjectMembers(Long projectId);

    MemberResponse inviteMember(Long projectId, InviteMemberRequest request);

    List<InvitationResponse> getMyInvitations();

    MemberResponse acceptInvite(Long projectId);

    void declineInvite(Long projectId);

    void withdrawInvite(Long projectId, Long inviteId);

    MemberResponse updateMemberRole(Long projectId, Long memberId, UpdateMemberRoleRequest request);

    void removeProjectMember(Long projectId, Long memberId);
}
