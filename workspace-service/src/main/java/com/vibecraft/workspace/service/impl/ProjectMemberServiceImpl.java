package com.vibecraft.workspace.service.impl;

import com.vibecraft.common.dto.UserDto;
import com.vibecraft.workspace.dto.member.InviteMemberRequest;
import com.vibecraft.workspace.dto.member.MemberResponse;
import com.vibecraft.workspace.dto.member.UpdateMemberRoleRequest;
import com.vibecraft.workspace.entity.Project;
import com.vibecraft.workspace.entity.ProjectMember;
import com.vibecraft.workspace.entity.ProjectMemberId;
import com.vibecraft.common.error.ForbiddenException;
import com.vibecraft.common.error.ResourceNotFoundException;
import com.vibecraft.workspace.feign.AccountServiceClient;
import com.vibecraft.workspace.mapper.ProjectMemberMapper;
import com.vibecraft.workspace.repository.ProjectMemberRepository;
import com.vibecraft.workspace.repository.ProjectRepository;
import com.vibecraft.workspace.security.AuthUtil;
import com.vibecraft.workspace.service.ProjectMemberService;
import feign.FeignException;
import jakarta.transaction.Transactional;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
@FieldDefaults(makeFinal = true, level = AccessLevel.PRIVATE)
@RequiredArgsConstructor
@Transactional
public class ProjectMemberServiceImpl implements ProjectMemberService {

    ProjectMemberRepository projectMemberRepository;
    ProjectRepository projectRepository;
    ProjectMemberMapper projectMemberMapper;
    AuthUtil authUtil;
    AccountServiceClient accountServiceClient;

    @Override
    @PreAuthorize("@security.canViewMembers(#projectId)")
    public List<MemberResponse> getProjectMembers(Long projectId) {

        // One Feign call per member to build its MemberResponse - there is no batch user-lookup endpoint on
        // account-service today. Fine for the small membership lists this feature actually has; a candidate for
        // a future GET /internal/v1/users?ids= if it ever shows up as real latency.
        return projectMemberRepository.findByIdProjectId(projectId)
                .stream()
                .map(member -> projectMemberMapper.toMemberResponse(member, resolveUser(member.getId().getUserId())))
                .toList();
    }

    @Override
    @PreAuthorize("@security.canManageMembers(#projectId)")
    public MemberResponse inviteMember(Long projectId, InviteMemberRequest request) {

        Long userId = authUtil.getCurrentUserId();
        Project project = getAccessibleProjectById(projectId, userId);

        UserDto invitee;
        try {
            invitee = accountServiceClient.getUserByUsername(request.username());
        } catch (FeignException.NotFound e) {
            throw new ResourceNotFoundException("User", request.username());
        }

        if (invitee.id().equals(userId)) {
            throw new ForbiddenException("Cannot invite yourself");
        }

        ProjectMemberId projectMemberId = new ProjectMemberId(projectId, invitee.id());

        if (projectMemberRepository.existsById(projectMemberId)) {
            throw new ForbiddenException("Cannot invite once again");
        }

        ProjectMember member = ProjectMember.builder()
                .id(projectMemberId)
                .project(project)
                .projectRole(request.role())
                .invitedAt(Instant.now())
                .build();

        projectMemberRepository.save(member);

        return projectMemberMapper.toMemberResponse(member, invitee);
    }

    @Override
    public MemberResponse acceptInvite(Long projectId) {

        Long userId = authUtil.getCurrentUserId();
        ProjectMemberId projectMemberId = new ProjectMemberId(projectId, userId);

        ProjectMember projectMember = projectMemberRepository.findById(projectMemberId)
                .orElseThrow(() -> new ResourceNotFoundException("ProjectMember", userId.toString()));

        if (projectMember.getAcceptedAt() == null) {
            projectMember.setAcceptedAt(Instant.now());
            projectMemberRepository.save(projectMember);
        }

        return projectMemberMapper.toMemberResponse(projectMember, resolveUser(userId));
    }

    @Override
    @PreAuthorize("@security.canManageMembers(#projectId)")
    public MemberResponse updateMemberRole(Long projectId, Long memberId, UpdateMemberRoleRequest request) {

        ProjectMemberId projectMemberId = new ProjectMemberId(projectId, memberId);
        ProjectMember projectMember = projectMemberRepository.findById(projectMemberId)
                .orElseThrow(() -> new ResourceNotFoundException("ProjectMember", memberId.toString()));

        projectMember.setProjectRole(request.role());

        projectMemberRepository.save(projectMember);

        return projectMemberMapper.toMemberResponse(projectMember, resolveUser(memberId));
    }

    @Override
    @PreAuthorize("@security.canManageMembers(#projectId)")
    public void removeProjectMember(Long projectId, Long memberId) {

        ProjectMemberId projectMemberId = new ProjectMemberId(projectId, memberId);
        if (!projectMemberRepository.existsById(projectMemberId)) {
            throw new ResourceNotFoundException("ProjectMember", memberId.toString());
        }

        projectMemberRepository.deleteById(projectMemberId);
    }

    public Project getAccessibleProjectById(Long projectId, Long userId) {

        return projectRepository.findAccessibleProjectById(projectId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Project", projectId.toString()));
    }

    private UserDto resolveUser(Long userId) {
        try {
            return accountServiceClient.getUser(userId);
        } catch (FeignException.NotFound e) {
            throw new ResourceNotFoundException("User", userId.toString());
        }
    }
}
