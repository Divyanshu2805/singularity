package com.singularity.workspace.service.impl;

import com.singularity.common.dto.UserDto;
import com.singularity.common.error.BadRequestException;
import com.singularity.common.error.ConflictException;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.common.feign.AccountServiceClient;
import com.singularity.common.security.AuthUtil;
import com.singularity.common.security.UserPrincipal;
import com.singularity.workspace.dto.member.InvitationResponse;
import com.singularity.workspace.dto.member.InviteMemberRequest;
import com.singularity.workspace.dto.member.MemberResponse;
import com.singularity.workspace.entity.Project;
import com.singularity.workspace.entity.ProjectInvite;
import com.singularity.workspace.entity.ProjectMember;
import com.singularity.workspace.entity.ProjectMemberId;
import com.singularity.workspace.enums.ProjectRole;
import com.singularity.workspace.feign.IntelligenceServiceClient;
import com.singularity.workspace.mapper.ProjectMemberMapper;
import com.singularity.workspace.repository.ProjectInviteRepository;
import com.singularity.workspace.repository.ProjectMemberRepository;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.service.PreviewDeploymentService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Invitations: held by address until accepted, and silent about which addresses have an account.
 *
 * <p>Handles: an invitation writes no membership and asks account-service nothing about the address; the answer is
 * the same shape for any address; the address is lower-cased; the owner's own address and a current member's are
 * refused; the cap on open invitations, which a repeat invitation does not count against; only the owner sees open
 * invitations in the member list; accepting needs an invitation addressed to the caller's own email and is what
 * writes the membership, with the role the invitation offered; an invitation to a deleted project cannot be
 * accepted; declining removes only the caller's own invitation; withdrawing is tied to the project in the path.
 */
class ProjectMemberServiceImplInviteTest {

    private static final long PROJECT_ID = 1L;
    private static final long OWNER_ID = 10L;
    private static final long INVITEE_ID = 20L;
    private static final String OWNER_EMAIL = "owner@example.com";
    private static final String INVITEE_EMAIL = "invitee@example.com";

    private final ProjectMemberRepository projectMemberRepository = mock(ProjectMemberRepository.class);
    private final ProjectInviteRepository projectInviteRepository = mock(ProjectInviteRepository.class);
    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final ProjectMemberMapper projectMemberMapper = mock(ProjectMemberMapper.class);
    private final AccountServiceClient accountServiceClient = mock(AccountServiceClient.class);
    private final PreviewDeploymentService previewDeploymentService = mock(PreviewDeploymentService.class);
    private final ProjectMemberServiceImpl service = new ProjectMemberServiceImpl(
            projectMemberRepository, projectInviteRepository, projectRepository, projectMemberMapper, new AuthUtil(),
            accountServiceClient, mock(IntelligenceServiceClient.class), previewDeploymentService);

    private final Project project = Project.builder().id(PROJECT_ID).name("demo").build();

    @AfterEach
    void clean() {
        SecurityContextHolder.clearContext();
    }

    private void signInAs(long userId, String email) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new UserPrincipal(userId, email, "firebase-" + userId, List.of()), null, List.of()));
    }

    private void asOwner() {
        signInAs(OWNER_ID, OWNER_EMAIL);
        when(projectRepository.findAccessibleProjectById(PROJECT_ID, OWNER_ID)).thenReturn(Optional.of(project));
        when(projectMemberRepository.findRoleByProjectIdAndUserId(PROJECT_ID, OWNER_ID))
                .thenReturn(Optional.of(ProjectRole.OWNER));
    }

    private ProjectInvite invite(long id, String email, ProjectRole role) {
        return ProjectInvite.builder().id(id).project(project).email(email).projectRole(role)
                .invitedBy(OWNER_ID).invitedAt(Instant.parse("2026-10-01T10:00:00Z")).build();
    }

    @Test
    void anInvitationWritesNoMembershipAndNeverAsksWhetherTheAddressHasAnAccount() {
        asOwner();

        MemberResponse response = service.inviteMember(PROJECT_ID, new InviteMemberRequest(INVITEE_EMAIL, ProjectRole.EDITOR));

        verify(projectInviteRepository).upsert(eq(PROJECT_ID), eq(INVITEE_EMAIL), eq("EDITOR"), eq(OWNER_ID), any());
        verify(projectMemberRepository, never()).save(any());
        verifyNoInteractions(accountServiceClient);
        assertThat(response.userId()).isNull();
        assertThat(response.name()).isNull();
        assertThat(response.acceptedAt()).isNull();
        assertThat(response.username()).isEqualTo(INVITEE_EMAIL);
        assertThat(response.role()).isEqualTo(ProjectRole.EDITOR);
    }

    @Test
    void theAddressIsStoredInLowerCaseWithoutSurroundingSpace() {
        asOwner();

        service.inviteMember(PROJECT_ID, new InviteMemberRequest("  Invitee@Example.COM ", ProjectRole.VIEWER));

        verify(projectInviteRepository).upsert(eq(PROJECT_ID), eq(INVITEE_EMAIL), eq("VIEWER"), eq(OWNER_ID), any());
    }

    @Test
    void theOwnersOwnAddressIsRefusedWhateverItsCase() {
        asOwner();

        assertThatThrownBy(() -> service.inviteMember(PROJECT_ID, new InviteMemberRequest("Owner@Example.com", ProjectRole.EDITOR)))
                .isInstanceOf(BadRequestException.class);

        verify(projectInviteRepository, never()).upsert(any(), any(), any(), any(), any());
    }

    @Test
    void anAddressThatAlreadyBelongsToAMemberIsRefused() {
        asOwner();
        ProjectMember member = ProjectMember.builder().id(new ProjectMemberId(PROJECT_ID, INVITEE_ID))
                .projectRole(ProjectRole.VIEWER).build();
        UserDto user = new UserDto(INVITEE_ID, INVITEE_EMAIL, "Invitee", "uid-2");
        when(projectMemberRepository.findByIdProjectId(PROJECT_ID)).thenReturn(List.of(member));
        when(accountServiceClient.getUser(INVITEE_ID)).thenReturn(user);
        when(projectMemberMapper.toMemberResponse(member, user)).thenReturn(
                new MemberResponse(INVITEE_ID, null, INVITEE_EMAIL, "Invitee", ProjectRole.VIEWER, null, Instant.now()));

        assertThatThrownBy(() -> service.inviteMember(PROJECT_ID, new InviteMemberRequest(INVITEE_EMAIL, ProjectRole.EDITOR)))
                .isInstanceOf(ConflictException.class);

        verify(projectInviteRepository, never()).upsert(any(), any(), any(), any(), any());
    }

    @Test
    void aProjectHoldsOnlySoManyOpenInvitations() {
        asOwner();
        when(projectInviteRepository.countByProjectId(PROJECT_ID)).thenReturn(ProjectMemberServiceImpl.MAX_OPEN_INVITES);

        assertThatThrownBy(() -> service.inviteMember(PROJECT_ID, new InviteMemberRequest(INVITEE_EMAIL, ProjectRole.EDITOR)))
                .isInstanceOf(BadRequestException.class);

        verify(projectInviteRepository, never()).upsert(any(), any(), any(), any(), any());
    }

    @Test
    void invitingTheSameAddressAgainChangesTheOfferEvenAtTheCap() {
        asOwner();
        when(projectInviteRepository.countByProjectId(PROJECT_ID)).thenReturn(ProjectMemberServiceImpl.MAX_OPEN_INVITES);
        when(projectInviteRepository.findOpenByProjectIdAndEmail(PROJECT_ID, INVITEE_EMAIL))
                .thenReturn(Optional.of(invite(5L, INVITEE_EMAIL, ProjectRole.VIEWER)));

        MemberResponse response = service.inviteMember(PROJECT_ID, new InviteMemberRequest(INVITEE_EMAIL, ProjectRole.EDITOR));

        verify(projectInviteRepository).upsert(eq(PROJECT_ID), eq(INVITEE_EMAIL), eq("EDITOR"), eq(OWNER_ID), any());
        assertThat(response.inviteId()).isEqualTo(5L);
    }

    @Test
    void theOwnerSeesOpenInvitationsInTheMemberList() {
        asOwner();
        when(projectInviteRepository.findByProjectId(PROJECT_ID))
                .thenReturn(List.of(invite(5L, INVITEE_EMAIL, ProjectRole.EDITOR)));

        List<MemberResponse> members = service.getProjectMembers(PROJECT_ID);

        assertThat(members).singleElement().satisfies(pending -> {
            assertThat(pending.inviteId()).isEqualTo(5L);
            assertThat(pending.userId()).isNull();
            assertThat(pending.username()).isEqualTo(INVITEE_EMAIL);
            assertThat(pending.acceptedAt()).isNull();
        });
    }

    @Test
    void anyoneButTheOwnerSeesNoOpenInvitations() {
        signInAs(INVITEE_ID, INVITEE_EMAIL);
        when(projectMemberRepository.findRoleByProjectIdAndUserId(PROJECT_ID, INVITEE_ID))
                .thenReturn(Optional.of(ProjectRole.EDITOR));

        assertThat(service.getProjectMembers(PROJECT_ID)).isEmpty();

        verify(projectInviteRepository, never()).findByProjectId(any());
    }

    @Test
    void acceptingIsWhatWritesTheMembershipWithTheRoleOnOffer() {
        signInAs(INVITEE_ID, "Invitee@Example.com");
        ProjectInvite invite = invite(5L, INVITEE_EMAIL, ProjectRole.VIEWER);
        when(projectInviteRepository.findOpenByProjectIdAndEmail(PROJECT_ID, INVITEE_EMAIL)).thenReturn(Optional.of(invite));
        when(projectMemberRepository.findById(new ProjectMemberId(PROJECT_ID, INVITEE_ID))).thenReturn(Optional.empty());
        when(projectMemberRepository.save(any())).thenAnswer(call -> call.getArgument(0));
        when(accountServiceClient.getUser(INVITEE_ID)).thenReturn(new UserDto(INVITEE_ID, INVITEE_EMAIL, "Invitee", "uid-2"));

        service.acceptInvite(PROJECT_ID);

        ArgumentCaptor<ProjectMember> saved = ArgumentCaptor.forClass(ProjectMember.class);
        verify(projectMemberRepository).save(saved.capture());
        assertThat(saved.getValue().getId()).isEqualTo(new ProjectMemberId(PROJECT_ID, INVITEE_ID));
        assertThat(saved.getValue().getProjectRole()).isEqualTo(ProjectRole.VIEWER);
        assertThat(saved.getValue().getAcceptedAt()).isNotNull();
        verify(projectInviteRepository).delete(invite);
    }

    @Test
    void acceptingWithoutAnInvitationAddressedToTheCallerIsNotFound() {
        signInAs(INVITEE_ID, "someone-else@example.com");
        when(projectInviteRepository.findOpenByProjectIdAndEmail(PROJECT_ID, "someone-else@example.com"))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.acceptInvite(PROJECT_ID)).isInstanceOf(ResourceNotFoundException.class);

        verify(projectMemberRepository, never()).save(any());
    }

    @Test
    void acceptingNeverOverwritesAMembershipThatAlreadyExists() {
        signInAs(INVITEE_ID, INVITEE_EMAIL);
        ProjectInvite invite = invite(5L, INVITEE_EMAIL, ProjectRole.EDITOR);
        ProjectMember existing = ProjectMember.builder().id(new ProjectMemberId(PROJECT_ID, INVITEE_ID))
                .projectRole(ProjectRole.VIEWER).build();
        when(projectInviteRepository.findOpenByProjectIdAndEmail(PROJECT_ID, INVITEE_EMAIL)).thenReturn(Optional.of(invite));
        when(projectMemberRepository.findById(existing.getId())).thenReturn(Optional.of(existing));
        when(accountServiceClient.getUser(INVITEE_ID)).thenReturn(new UserDto(INVITEE_ID, INVITEE_EMAIL, "Invitee", "uid-2"));

        service.acceptInvite(PROJECT_ID);

        verify(projectMemberRepository, never()).save(any());
        assertThat(existing.getProjectRole()).isEqualTo(ProjectRole.VIEWER);
        verify(projectInviteRepository).delete(invite);
    }

    @Test
    void decliningRemovesOnlyTheCallersOwnInvitation() {
        signInAs(INVITEE_ID, "Invitee@Example.com");

        service.declineInvite(PROJECT_ID);

        verify(projectInviteRepository).deleteByProjectIdAndEmail(PROJECT_ID, INVITEE_EMAIL);
        verify(projectMemberRepository, never()).save(any());
    }

    @Test
    void theCallersInvitationsAreLookedUpByTheirOwnEmailAndNameTheSender() {
        signInAs(INVITEE_ID, "Invitee@Example.com");
        when(projectInviteRepository.findOpenByEmail(INVITEE_EMAIL))
                .thenReturn(List.of(invite(5L, INVITEE_EMAIL, ProjectRole.EDITOR)));
        when(accountServiceClient.getUser(OWNER_ID)).thenReturn(new UserDto(OWNER_ID, OWNER_EMAIL, "Owner", "uid-1"));

        List<InvitationResponse> invitations = service.getMyInvitations();

        assertThat(invitations).containsExactly(new InvitationResponse(
                PROJECT_ID, "demo", ProjectRole.EDITOR, "Owner", Instant.parse("2026-10-01T10:00:00Z")));
    }

    @Test
    void anInvitationIsStillListedWhenItsSenderCannotBeResolved() {
        signInAs(INVITEE_ID, INVITEE_EMAIL);
        when(projectInviteRepository.findOpenByEmail(INVITEE_EMAIL))
                .thenReturn(List.of(invite(5L, INVITEE_EMAIL, ProjectRole.EDITOR)));
        when(accountServiceClient.getUser(OWNER_ID)).thenThrow(new RuntimeException("account-service unreachable"));

        assertThat(service.getMyInvitations()).singleElement()
                .satisfies(invitation -> assertThat(invitation.invitedByName()).isNull());
    }

    @Test
    void withdrawingIsTiedToTheProjectInThePath() {
        asOwner();
        when(projectInviteRepository.findByIdAndProjectId(5L, PROJECT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.withdrawInvite(PROJECT_ID, 5L)).isInstanceOf(ResourceNotFoundException.class);

        verify(projectInviteRepository, never()).delete(any());
    }

    @Test
    void withdrawingDeletesTheInvitation() {
        asOwner();
        ProjectInvite invite = invite(5L, INVITEE_EMAIL, ProjectRole.EDITOR);
        when(projectInviteRepository.findByIdAndProjectId(5L, PROJECT_ID)).thenReturn(Optional.of(invite));

        service.withdrawInvite(PROJECT_ID, 5L);

        verify(projectInviteRepository).delete(invite);
    }
}
