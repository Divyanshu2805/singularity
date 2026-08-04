package com.vibecraft.workspace.service.impl;

import com.vibecraft.common.dto.UserDto;
import com.vibecraft.common.error.BadRequestException;
import com.vibecraft.common.feign.AccountServiceClient;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.common.security.UserPrincipal;
import com.vibecraft.workspace.dto.member.InviteMemberRequest;
import com.vibecraft.workspace.dto.member.UpdateMemberRoleRequest;
import com.vibecraft.workspace.entity.Project;
import com.vibecraft.workspace.entity.ProjectMember;
import com.vibecraft.workspace.entity.ProjectMemberId;
import com.vibecraft.workspace.enums.ProjectRole;
import com.vibecraft.workspace.feign.IntelligenceServiceClient;
import com.vibecraft.workspace.mapper.ProjectMemberMapper;
import com.vibecraft.workspace.repository.ProjectMemberRepository;
import com.vibecraft.workspace.repository.ProjectRepository;
import com.vibecraft.workspace.service.PreviewDeploymentService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers CODE_REVIEW.md SEC-04: the single-owner invariant must hold no matter which entry point a caller tries,
 * since a direct request bypasses whatever the UI happens to disable.
 *
 * <p>There is deliberately no ownership-transfer feature at all - a project's OWNER is assigned once, at creation or
 * fork, and never after - so "preserve an owner" reduces to three checks: invitation can't grant OWNER, a role change
 * can't promote to or demote from OWNER, and the OWNER can't be removed. All three are enforced in
 * ProjectMemberServiceImpl regardless of who calls, so this also covers self-demotion (a caller changing their own
 * role) and last-owner removal (there is only ever one).
 */
class ProjectMemberServiceImplOwnershipTest {

    private static final long PROJECT_ID = 1L;
    private static final long OWNER_ID = 10L;
    private static final long OTHER_MEMBER_ID = 20L;
    private static final long CALLER_ID = 10L;

    private final ProjectMemberRepository projectMemberRepository = mock(ProjectMemberRepository.class);
    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final ProjectMemberMapper projectMemberMapper = mock(ProjectMemberMapper.class);
    private final AccountServiceClient accountServiceClient = mock(AccountServiceClient.class);
    private final IntelligenceServiceClient intelligenceServiceClient = mock(IntelligenceServiceClient.class);
    private final PreviewDeploymentService previewDeploymentService = mock(PreviewDeploymentService.class);
    private final ProjectMemberServiceImpl service = new ProjectMemberServiceImpl(
            projectMemberRepository, projectRepository, projectMemberMapper, new AuthUtil(), accountServiceClient,
            intelligenceServiceClient, previewDeploymentService);

    @BeforeEach
    void signIn() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new UserPrincipal(CALLER_ID, "caller", "firebase-uid", List.of()), null, List.of()));
    }

    @AfterEach
    void clean() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void invitingSomeoneAsOwnerIsRejected() {
        Project project = Project.builder().id(PROJECT_ID).name("demo").build();
        when(projectRepository.findAccessibleProjectById(PROJECT_ID, CALLER_ID)).thenReturn(Optional.of(project));
        when(accountServiceClient.getUserByUsername("invitee@example.com"))
                .thenReturn(new UserDto(OTHER_MEMBER_ID, "invitee@example.com", "Invitee", "uid-2"));

        assertThatThrownBy(() -> service.inviteMember(PROJECT_ID,
                new InviteMemberRequest("invitee@example.com", ProjectRole.OWNER)))
                .isInstanceOf(BadRequestException.class);

        verify(projectMemberRepository, never()).save(any());
    }

    @Test
    void changingSomeonesRoleToOwnerIsRejected() {
        ProjectMemberId memberId = new ProjectMemberId(PROJECT_ID, OTHER_MEMBER_ID);
        ProjectMember member = ProjectMember.builder().id(memberId).projectRole(ProjectRole.EDITOR).build();
        when(projectMemberRepository.findById(memberId)).thenReturn(Optional.of(member));

        assertThatThrownBy(() -> service.updateMemberRole(PROJECT_ID, OTHER_MEMBER_ID,
                new UpdateMemberRoleRequest(ProjectRole.OWNER)))
                .isInstanceOf(BadRequestException.class);

        assertThat(member.getProjectRole()).isEqualTo(ProjectRole.EDITOR);
        verify(projectMemberRepository, never()).save(any());
    }

    @Test
    void demotingTheOwnerIsRejectedEvenWhenTheOwnerDemotesThemselves() {
        ProjectMemberId ownerId = new ProjectMemberId(PROJECT_ID, OWNER_ID);
        ProjectMember owner = ProjectMember.builder().id(ownerId).projectRole(ProjectRole.OWNER).build();
        when(projectMemberRepository.findById(ownerId)).thenReturn(Optional.of(owner));

        assertThatThrownBy(() -> service.updateMemberRole(PROJECT_ID, OWNER_ID,
                new UpdateMemberRoleRequest(ProjectRole.EDITOR)))
                .isInstanceOf(BadRequestException.class);

        assertThat(owner.getProjectRole()).isEqualTo(ProjectRole.OWNER);
        verify(projectMemberRepository, never()).save(any());
    }

    @Test
    void removingTheOwnerIsRejected() {
        ProjectMemberId ownerId = new ProjectMemberId(PROJECT_ID, OWNER_ID);
        ProjectMember owner = ProjectMember.builder().id(ownerId).projectRole(ProjectRole.OWNER).build();
        when(projectMemberRepository.findById(ownerId)).thenReturn(Optional.of(owner));

        assertThatThrownBy(() -> service.removeProjectMember(PROJECT_ID, OWNER_ID))
                .isInstanceOf(BadRequestException.class);

        verify(projectMemberRepository, never()).delete(any());
    }

    @Test
    void changingRoleBetweenNonOwnerRolesStillWorks() {
        ProjectMemberId memberId = new ProjectMemberId(PROJECT_ID, OTHER_MEMBER_ID);
        ProjectMember member = ProjectMember.builder().id(memberId).projectRole(ProjectRole.VIEWER).build();
        when(projectMemberRepository.findById(memberId)).thenReturn(Optional.of(member));
        when(accountServiceClient.getUser(OTHER_MEMBER_ID))
                .thenReturn(new UserDto(OTHER_MEMBER_ID, "member@example.com", "Member", "uid-3"));

        service.updateMemberRole(PROJECT_ID, OTHER_MEMBER_ID, new UpdateMemberRoleRequest(ProjectRole.EDITOR));

        assertThat(member.getProjectRole()).isEqualTo(ProjectRole.EDITOR);
        verify(projectMemberRepository).save(member);
    }

    @Test
    void removingANonOwnerStillWorks() {
        ProjectMemberId memberId = new ProjectMemberId(PROJECT_ID, OTHER_MEMBER_ID);
        ProjectMember member = ProjectMember.builder().id(memberId).projectRole(ProjectRole.EDITOR).build();
        when(projectMemberRepository.findById(memberId)).thenReturn(Optional.of(member));

        service.removeProjectMember(PROJECT_ID, OTHER_MEMBER_ID);

        verify(projectMemberRepository).delete(member);
    }

    @Test
    void removingAMemberAlsoStopsTheirGenerationAndPreviewSession() {
        ProjectMemberId memberId = new ProjectMemberId(PROJECT_ID, OTHER_MEMBER_ID);
        ProjectMember member = ProjectMember.builder().id(memberId).projectRole(ProjectRole.EDITOR).build();
        when(projectMemberRepository.findById(memberId)).thenReturn(Optional.of(member));

        service.removeProjectMember(PROJECT_ID, OTHER_MEMBER_ID);

        verify(intelligenceServiceClient).stopGeneration(PROJECT_ID, OTHER_MEMBER_ID);
        verify(previewDeploymentService).endSessionForUser(eq(PROJECT_ID), eq(OTHER_MEMBER_ID), anyString());
    }

    @Test
    void removingTheOwnerDoesNotRevokeAnythingSinceItIsRejectedFirst() {
        ProjectMemberId ownerId = new ProjectMemberId(PROJECT_ID, OWNER_ID);
        ProjectMember owner = ProjectMember.builder().id(ownerId).projectRole(ProjectRole.OWNER).build();
        when(projectMemberRepository.findById(ownerId)).thenReturn(Optional.of(owner));

        assertThatThrownBy(() -> service.removeProjectMember(PROJECT_ID, OWNER_ID))
                .isInstanceOf(BadRequestException.class);

        verify(intelligenceServiceClient, never()).stopGeneration(any(), any());
        verify(previewDeploymentService, never()).endSessionForUser(any(), any(), any());
    }
}
