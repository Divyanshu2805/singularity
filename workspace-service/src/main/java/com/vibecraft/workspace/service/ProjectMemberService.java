package com.vibecraft.workspace.service;

import com.vibecraft.workspace.dto.member.InviteMemberRequest;
import com.vibecraft.workspace.dto.member.MemberResponse;
import com.vibecraft.workspace.dto.member.UpdateMemberRoleRequest;

import java.util.List;

public interface ProjectMemberService {
    List<MemberResponse> getProjectMembers(Long projectId);

    MemberResponse inviteMember(Long projectId, InviteMemberRequest request);

    MemberResponse acceptInvite(Long projectId);

    MemberResponse updateMemberRole(Long projectId, Long memberId, UpdateMemberRoleRequest request);

    void removeProjectMember(Long projectId, Long memberId);
}
