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
import com.vibecraft.workspace.feign.IntelligenceServiceClient;
import com.vibecraft.workspace.mapper.ProjectMemberMapper;
import com.vibecraft.workspace.repository.ProjectMemberRepository;
import com.vibecraft.workspace.repository.ProjectRepository;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.workspace.service.PreviewDeploymentService;
import com.vibecraft.workspace.service.ProjectMemberService;
import feign.FeignException;
import jakarta.transaction.Transactional;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
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
 *
 * <p>Removal also revokes standing, not just the row: it best-effort asks intelligence-service to stop that member's
 * in-flight generation and ends their open preview session, so losing access takes effect immediately rather than
 * only once whatever they were doing happens to finish.
 */
@Service
@FieldDefaults(makeFinal = true, level = AccessLevel.PRIVATE)
@RequiredArgsConstructor
@Transactional
@Slf4j
public class ProjectMemberServiceImpl implements ProjectMemberService {

    ProjectMemberRepository projectMemberRepository;
    ProjectRepository projectRepository;
    ProjectMemberMapper projectMemberMapper;
    AuthUtil authUtil;
    AccountServiceClient accountServiceClient;
    IntelligenceServiceClient intelligenceServiceClient;
    PreviewDeploymentService previewDeploymentService;

    /**
     * One dangling {@code user_id} - account-service unreachable, or (CODE_REVIEW.md OPS-03) a cross-database
     * restore taken at a different point in time than workspace-service's own - must not take the rest of an
     * otherwise-healthy project's member list down with it. A loop with a per-member try/catch, not
     * {@code .stream().map(...)}: a plain {@code map} has no way to skip one element on exception without aborting
     * the whole pipeline, which is exactly the bug this replaces (every member became unlistable because of one
     * unrelated one). Mirrors {@code InternalWorkspaceController.getProjectSummaries}' existing "drop what can't
     * resolve" behavior for the same class of problem.
     */
    @Override
    @PreAuthorize("@security.canViewMembers(#projectId)")
    public List<MemberResponse> getProjectMembers(Long projectId) {

        List<MemberResponse> members = new ArrayList<>();
        for (ProjectMember member : projectMemberRepository.findByIdProjectId(projectId)) {
            Long userId = member.getId().getUserId();
            try {
                members.add(projectMemberMapper.toMemberResponse(member, resolveUser(userId)));
            } catch (ResourceNotFoundException e) {
                log.warn("Skipping unresolvable member userId: {} on projectId: {} - its account row no longer " +
                        "resolves; the rest of the member list is unaffected.", userId, projectId);
            }
        }
        return members;
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
        revokeAccessFor(projectId, memberId);
    }

    /**
     * Best-effort: stops the removed member's in-flight generation and ends their preview session, so a removal
     * takes effect immediately instead of only once their (already-unauthorized) work happens to finish on its own.
     * Never fails the removal itself if intelligence-service is unreachable - AiGenerationServiceImpl's own recheck
     * before committing is what actually keeps a removed member's changes out either way.
     */
    private void revokeAccessFor(Long projectId, Long userId) {
        try {
            intelligenceServiceClient.stopGeneration(projectId, userId);
        } catch (Exception e) {
            log.warn("Couldn't ask intelligence-service to stop generation for projectId: {}, userId: {} - " +
                    "any in-flight response will still be denied when it tries to commit.", projectId, userId, e);
        }
        previewDeploymentService.endSessionForUser(projectId, userId, "Removed from the project");
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
