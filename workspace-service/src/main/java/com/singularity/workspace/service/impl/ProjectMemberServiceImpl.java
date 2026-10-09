package com.singularity.workspace.service.impl;

import com.singularity.common.dto.UserDto;
import com.singularity.common.security.UserPrincipal;
import com.singularity.workspace.dto.member.InvitationResponse;
import com.singularity.workspace.dto.member.InviteMemberRequest;
import com.singularity.workspace.dto.member.MemberResponse;
import com.singularity.workspace.dto.member.UpdateMemberRoleRequest;
import com.singularity.workspace.entity.Project;
import com.singularity.workspace.entity.ProjectInvite;
import com.singularity.workspace.entity.ProjectMember;
import com.singularity.workspace.entity.ProjectMemberId;
import com.singularity.workspace.enums.ProjectPermission;
import com.singularity.workspace.enums.ProjectRole;
import com.singularity.common.error.BadRequestException;
import com.singularity.common.error.ConflictException;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.common.feign.AccountServiceClient;
import com.singularity.workspace.feign.IntelligenceServiceClient;
import com.singularity.workspace.mapper.ProjectMemberMapper;
import com.singularity.workspace.repository.ProjectInviteRepository;
import com.singularity.workspace.repository.ProjectMemberRepository;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.common.security.AuthUtil;
import com.singularity.workspace.service.PreviewDeploymentService;
import com.singularity.workspace.service.ProjectMemberService;
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
import java.util.Locale;

/**
 * A project's collaborators and the invitations that have not been answered yet.
 *
 * <p>Handles: listing members with their names resolved from account-service, and for the owner the open
 * invitations beside them; inviting an email address; the invited person listing, accepting and declining their own
 * invitations; the owner withdrawing one; changing a role and removing a member.
 *
 * <p>An invitation grants nothing until it is accepted. It is a row of its own, keyed by the address, and only
 * accepting it writes a membership - so every membership row is one somebody agreed to, and no permission query has
 * to tell a pending one apart. Inviting never asks account-service whether the address has an account, and answers
 * and stores the same thing either way: before this the endpoint answered 404 for an unregistered address, which let
 * any project owner test addresses one by one. The invitation is matched to a person by the email of the session
 * they are signed in with, which sign-in refuses unless the identity provider has verified it. The address is
 * compared in lower case on both sides.
 *
 * <p>The one thing inviting does reveal is an address that already belongs to a member of the same project, which
 * the owner can read in the member list anyway. Open invitations are shown to the owner only: a viewer or editor
 * has no reason to see addresses of people who are not on the project. A project holds at most
 * {@link #MAX_OPEN_INVITES} open invitations, so it cannot be used to fill strangers' dashboards without limit.
 *
 * <p>It enforces the single-owner invariant: owner cannot be granted by invitation or by a role change, the owner's
 * own role cannot be changed, and the owner cannot be removed - deleting the project is the way to end it. Without
 * those checks a project could end up with two owners or none.
 *
 * <p>Listing makes one lookup per member because account-service has no batch user endpoint today. That is fine for
 * the membership sizes this feature actually has. One member whose account no longer resolves is left out of the
 * list and logged; a plain stream map would have failed the whole list for it.
 *
 * <p>Removal also revokes standing, not just the row: it best-effort asks intelligence-service to stop that member's
 * in-flight generation and ends their open preview session, so losing access takes effect immediately rather than
 * only once whatever they were doing happens to finish. That call never fails the removal: intelligence-service
 * rechecks membership before it saves a turn, which is what keeps a removed member's changes out either way.
 *
 * <p>The row is deleted and flushed before any of that revoking. Ending a preview session runs an update that clears
 * the persistence context when it is done, and a delete that had only been queued there was thrown away with it: a
 * member who had the preview open when they were removed was not removed at all, the request answered 204, and they
 * were back in the list on the next load. Only someone with a preview open was affected, which is why it went unseen.
 */
@Service
@FieldDefaults(makeFinal = true, level = AccessLevel.PRIVATE)
@RequiredArgsConstructor
@Transactional
@Slf4j
public class ProjectMemberServiceImpl implements ProjectMemberService {

    static final int MAX_OPEN_INVITES = 20;

    ProjectMemberRepository projectMemberRepository;
    ProjectInviteRepository projectInviteRepository;
    ProjectRepository projectRepository;
    ProjectMemberMapper projectMemberMapper;
    AuthUtil authUtil;
    AccountServiceClient accountServiceClient;
    IntelligenceServiceClient intelligenceServiceClient;
    PreviewDeploymentService previewDeploymentService;

    @Override
    @PreAuthorize("@security.canViewMembers(#projectId)")
    public List<MemberResponse> getProjectMembers(Long projectId) {

        List<MemberResponse> members = resolvedMembers(projectId);
        if (callerManagesMembers(projectId)) {
            for (ProjectInvite invite : projectInviteRepository.findByProjectId(projectId)) {
                members.add(toPending(invite));
            }
        }
        return members;
    }

    @Override
    @PreAuthorize("@security.canManageMembers(#projectId)")
    public MemberResponse inviteMember(Long projectId, InviteMemberRequest request) {

        UserPrincipal caller = authUtil.getCurrentPrincipal();
        getAccessibleProjectById(projectId, caller.userId());

        if (request.role() == ProjectRole.OWNER) {
            throw new BadRequestException("A project has exactly one owner, and it can't be granted by invitation.");
        }

        String email = normalize(request.username());
        if (email.equals(normalize(caller.username()))) {
            throw new BadRequestException("You're already on this project.");
        }
        for (MemberResponse member : resolvedMembers(projectId)) {
            if (email.equals(normalize(member.username()))) {
                throw new ConflictException("That person is already on this project.");
            }
        }

        boolean alreadyInvited = projectInviteRepository.findOpenByProjectIdAndEmail(projectId, email).isPresent();
        if (!alreadyInvited && projectInviteRepository.countByProjectId(projectId) >= MAX_OPEN_INVITES) {
            throw new BadRequestException("This project already has " + MAX_OPEN_INVITES
                    + " invitations waiting for an answer. Withdraw one before sending another.");
        }

        Instant now = Instant.now();
        projectInviteRepository.upsert(projectId, email, request.role().name(), caller.userId(), now);
        Long inviteId = projectInviteRepository.findOpenByProjectIdAndEmail(projectId, email)
                .map(ProjectInvite::getId)
                .orElse(null);

        return MemberResponse.pending(inviteId, email, request.role(), now);
    }

    @Override
    public List<InvitationResponse> getMyInvitations() {

        String email = normalize(authUtil.getCurrentPrincipal().username());
        List<InvitationResponse> invitations = new ArrayList<>();
        for (ProjectInvite invite : projectInviteRepository.findOpenByEmail(email)) {
            invitations.add(new InvitationResponse(
                    invite.getProject().getId(),
                    invite.getProject().getName(),
                    invite.getProjectRole(),
                    nameOf(invite.getInvitedBy()),
                    invite.getInvitedAt()));
        }
        return invitations;
    }

    @Override
    public MemberResponse acceptInvite(Long projectId) {

        UserPrincipal caller = authUtil.getCurrentPrincipal();
        Long userId = caller.userId();
        String email = normalize(caller.username());

        ProjectInvite invite = projectInviteRepository.findOpenByProjectIdAndEmail(projectId, email)
                .orElseThrow(() -> new ResourceNotFoundException("Invitation", projectId.toString()));

        ProjectMemberId projectMemberId = new ProjectMemberId(projectId, userId);
        ProjectMember member = projectMemberRepository.findById(projectMemberId).orElse(null);
        if (member == null) {
            member = projectMemberRepository.save(ProjectMember.builder()
                    .id(projectMemberId)
                    .project(invite.getProject())
                    .projectRole(invite.getProjectRole())
                    .invitedAt(invite.getInvitedAt())
                    .acceptedAt(Instant.now())
                    .build());
            log.info("User {} accepted an invitation to project {} as {}", userId, projectId, invite.getProjectRole());
        }
        projectInviteRepository.delete(invite);

        return projectMemberMapper.toMemberResponse(member, resolveUser(userId));
    }

    @Override
    public void declineInvite(Long projectId) {

        String email = normalize(authUtil.getCurrentPrincipal().username());
        projectInviteRepository.deleteByProjectIdAndEmail(projectId, email);
    }

    @Override
    @PreAuthorize("@security.canManageMembers(#projectId)")
    public void withdrawInvite(Long projectId, Long inviteId) {

        ProjectInvite invite = projectInviteRepository.findByIdAndProjectId(inviteId, projectId)
                .orElseThrow(() -> new ResourceNotFoundException("Invitation", inviteId.toString()));
        projectInviteRepository.delete(invite);
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
        projectMemberRepository.flush();
        revokeAccessFor(projectId, memberId);
    }

    private List<MemberResponse> resolvedMembers(Long projectId) {
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

    private boolean callerManagesMembers(Long projectId) {
        return projectMemberRepository.findRoleByProjectIdAndUserId(projectId, authUtil.getCurrentUserId())
                .map(role -> role.getPermissions().contains(ProjectPermission.MANAGE_MEMBERS))
                .orElse(false);
    }

    private static MemberResponse toPending(ProjectInvite invite) {
        return MemberResponse.pending(invite.getId(), invite.getEmail(), invite.getProjectRole(), invite.getInvitedAt());
    }

    static String normalize(String email) {
        return email == null ? "" : email.strip().toLowerCase(Locale.ROOT);
    }

    private String nameOf(Long userId) {
        try {
            return accountServiceClient.getUser(userId).name();
        } catch (Exception e) {
            log.warn("Couldn't resolve the sender of an invitation, userId: {}", userId);
            return null;
        }
    }

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
