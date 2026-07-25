package com.vibecraft.workspace.service.impl;

import com.vibecraft.common.dto.UserDto;
import com.vibecraft.workspace.dto.member.InviteMemberRequest;
import com.vibecraft.workspace.dto.member.MemberResponse;
import com.vibecraft.workspace.dto.member.UpdateMemberRoleRequest;
import com.vibecraft.workspace.entity.Project;
import com.vibecraft.workspace.entity.ProjectMember;
import com.vibecraft.workspace.entity.ProjectMemberId;
import com.vibecraft.workspace.enums.ProjectRole;
import com.vibecraft.common.error.BadRequestException;
import com.vibecraft.common.error.ConflictException;
import com.vibecraft.common.error.ResourceNotFoundException;
import com.vibecraft.common.feign.AccountServiceClient;
import com.vibecraft.workspace.mapper.ProjectMemberMapper;
import com.vibecraft.workspace.repository.ProjectMemberRepository;
import com.vibecraft.workspace.repository.ProjectRepository;
import com.vibecraft.common.security.AuthUtil;
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

/**
 * A project's collaborators.
 *
 * <p>Handles: listing members with their names resolved from account-service, inviting one by email, accepting an
 * invitation, changing a role and removing a member.
 *
 * <p>It enforces the single-owner invariant: owner cannot be granted by invitation or by a role change, the owner's
 * own role cannot be changed, and the owner cannot be removed - deleting the project is the way to end it. Without
 * those checks a project could end up with two owners or none.
 *
 * <p>Listing makes one lookup per member because account-service has no batch user endpoint today. That is fine for
 * the membership sizes this feature actually has.
 */
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
            throw new BadRequestException("You're already on this project.");
        }
        if (request.role() == ProjectRole.OWNER) {
            throw new BadRequestException("A project has exactly one owner, and it can't be granted by invitation.");
        }

        ProjectMemberId projectMemberId = new ProjectMemberId(projectId, invitee.id());

        if (projectMemberRepository.existsById(projectMemberId)) {
            throw new ConflictException("That person is already on this project.");
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

        assertOwnershipUnchanged(projectMember, request.role());
        projectMember.setProjectRole(request.role());

        projectMemberRepository.save(projectMember);

        return projectMemberMapper.toMemberResponse(projectMember, resolveUser(memberId));
    }

    @Override
    @PreAuthorize("@security.canManageMembers(#projectId)")
    public void removeProjectMember(Long projectId, Long memberId) {

        ProjectMemberId projectMemberId = new ProjectMemberId(projectId, memberId);
        ProjectMember projectMember = projectMemberRepository.findById(projectMemberId)
                .orElseThrow(() -> new ResourceNotFoundException("ProjectMember", memberId.toString()));

        if (projectMember.getProjectRole() == ProjectRole.OWNER) {
            throw new BadRequestException("The owner can't be removed from their own project. Delete the project instead.");
        }

        projectMemberRepository.delete(projectMember);
    }

    private static void assertOwnershipUnchanged(ProjectMember member, ProjectRole requested) {
        if (member.getProjectRole() == ProjectRole.OWNER && requested != ProjectRole.OWNER) {
            throw new BadRequestException("A project always has an owner, so the owner's role can't be changed.");
        }
        if (member.getProjectRole() != ProjectRole.OWNER && requested == ProjectRole.OWNER) {
            throw new BadRequestException("A project has exactly one owner, and ownership can't be handed over here.");
        }
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
