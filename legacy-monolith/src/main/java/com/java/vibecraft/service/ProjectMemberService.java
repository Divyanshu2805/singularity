package com.java.vibecraft.service;

import com.java.vibecraft.dto.member.InviteMemberRequest;
import com.java.vibecraft.dto.member.MemberResponse;
import com.java.vibecraft.dto.member.UpdateMemberRoleRequest;

import java.util.List;

public interface ProjectMemberService {
    List<MemberResponse> getProjectMembers(Long projectId);

    MemberResponse inviteMember(Long projectId, InviteMemberRequest request);

    MemberResponse acceptInvite(Long projectId);

    MemberResponse updateMemberRole(Long projectId, Long memberId, UpdateMemberRoleRequest request);

    void removeProjectMember(Long projectId, Long memberId);
}
