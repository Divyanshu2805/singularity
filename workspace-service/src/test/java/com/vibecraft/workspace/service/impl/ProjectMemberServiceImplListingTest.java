package com.vibecraft.workspace.service.impl;

import com.vibecraft.common.dto.UserDto;
import com.vibecraft.common.feign.AccountServiceClient;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.workspace.dto.member.MemberResponse;
import com.vibecraft.workspace.entity.ProjectMember;
import com.vibecraft.workspace.entity.ProjectMemberId;
import com.vibecraft.workspace.enums.ProjectRole;
import com.vibecraft.workspace.feign.IntelligenceServiceClient;
import com.vibecraft.workspace.mapper.ProjectMemberMapper;
import com.vibecraft.workspace.repository.ProjectMemberRepository;
import com.vibecraft.workspace.repository.ProjectRepository;
import com.vibecraft.workspace.service.PreviewDeploymentService;
import feign.FeignException;
import feign.Request;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Covers CODE_REVIEW.md OPS-03: a dangling {@code project_members.user_id} - account-service unreachable for that
 * one lookup, or (the concrete scenario this session's disaster-recovery drill found) a cross-database restore
 * skew where workspace-service's snapshot is newer than account-service's - must not take the rest of an
 * otherwise-healthy project's member list down with it. Before this fix, {@code getProjectMembers} used
 * {@code .stream().map(...)} with no per-member guard, so one unresolvable member threw out of the whole pipeline
 * and every other, healthy member became unlistable too.
 */
class ProjectMemberServiceImplListingTest {

    private static final long PROJECT_ID = 1L;
    private static final long HEALTHY_MEMBER_ID = 10L;
    private static final long DANGLING_MEMBER_ID = 20L;
    private static final long ANOTHER_HEALTHY_MEMBER_ID = 30L;

    private final ProjectMemberRepository projectMemberRepository = mock(ProjectMemberRepository.class);
    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final ProjectMemberMapper projectMemberMapper = mock(ProjectMemberMapper.class);
    private final AccountServiceClient accountServiceClient = mock(AccountServiceClient.class);
    private final IntelligenceServiceClient intelligenceServiceClient = mock(IntelligenceServiceClient.class);
    private final PreviewDeploymentService previewDeploymentService = mock(PreviewDeploymentService.class);
    private final ProjectMemberServiceImpl service = new ProjectMemberServiceImpl(
            projectMemberRepository, projectRepository, projectMemberMapper, new AuthUtil(), accountServiceClient,
            intelligenceServiceClient, previewDeploymentService);

    private ProjectMember memberOf(long userId, ProjectRole role) {
        return ProjectMember.builder().id(new ProjectMemberId(PROJECT_ID, userId)).projectRole(role).build();
    }

    private static FeignException.NotFound notFound() {
        Request request = Request.create(Request.HttpMethod.GET, "/internal/v1/users/1",
                Map.of(), (byte[]) null, StandardCharsets.UTF_8);
        return new FeignException.NotFound("not found", request, null, Map.of());
    }

    @Test
    @DisplayName("a dangling member is skipped; every other member still returns")
    void aDanglingMemberIsSkippedWithoutAffectingOthers() {
        ProjectMember healthy = memberOf(HEALTHY_MEMBER_ID, ProjectRole.OWNER);
        ProjectMember dangling = memberOf(DANGLING_MEMBER_ID, ProjectRole.EDITOR);
        ProjectMember alsoHealthy = memberOf(ANOTHER_HEALTHY_MEMBER_ID, ProjectRole.VIEWER);
        when(projectMemberRepository.findByIdProjectId(PROJECT_ID)).thenReturn(List.of(healthy, dangling, alsoHealthy));

        UserDto healthyUser = new UserDto(HEALTHY_MEMBER_ID, "owner@example.com", "Owner", "uid-1");
        UserDto alsoHealthyUser = new UserDto(ANOTHER_HEALTHY_MEMBER_ID, "viewer@example.com", "Viewer", "uid-3");
        when(accountServiceClient.getUser(HEALTHY_MEMBER_ID)).thenReturn(healthyUser);
        when(accountServiceClient.getUser(DANGLING_MEMBER_ID)).thenThrow(notFound());
        when(accountServiceClient.getUser(ANOTHER_HEALTHY_MEMBER_ID)).thenReturn(alsoHealthyUser);

        MemberResponse healthyResponse = new MemberResponse(HEALTHY_MEMBER_ID, "owner@example.com", "Owner", ProjectRole.OWNER, null, null);
        MemberResponse alsoHealthyResponse = new MemberResponse(ANOTHER_HEALTHY_MEMBER_ID, "viewer@example.com", "Viewer", ProjectRole.VIEWER, null, null);
        when(projectMemberMapper.toMemberResponse(healthy, healthyUser)).thenReturn(healthyResponse);
        when(projectMemberMapper.toMemberResponse(alsoHealthy, alsoHealthyUser)).thenReturn(alsoHealthyResponse);

        List<MemberResponse> result = service.getProjectMembers(PROJECT_ID);

        assertThat(result).containsExactly(healthyResponse, alsoHealthyResponse);
    }

    @Test
    @DisplayName("every member dangling returns an empty list rather than throwing")
    void everyMemberDanglingReturnsEmptyList() {
        ProjectMember dangling = memberOf(DANGLING_MEMBER_ID, ProjectRole.EDITOR);
        when(projectMemberRepository.findByIdProjectId(PROJECT_ID)).thenReturn(List.of(dangling));
        when(accountServiceClient.getUser(DANGLING_MEMBER_ID)).thenThrow(notFound());

        List<MemberResponse> result = service.getProjectMembers(PROJECT_ID);

        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("no dangling members behaves exactly as before")
    void noDanglingMembersReturnsEveryone() {
        ProjectMember healthy = memberOf(HEALTHY_MEMBER_ID, ProjectRole.OWNER);
        when(projectMemberRepository.findByIdProjectId(PROJECT_ID)).thenReturn(List.of(healthy));
        UserDto healthyUser = new UserDto(HEALTHY_MEMBER_ID, "owner@example.com", "Owner", "uid-1");
        when(accountServiceClient.getUser(HEALTHY_MEMBER_ID)).thenReturn(healthyUser);
        MemberResponse healthyResponse = new MemberResponse(HEALTHY_MEMBER_ID, "owner@example.com", "Owner", ProjectRole.OWNER, null, null);
        when(projectMemberMapper.toMemberResponse(healthy, healthyUser)).thenReturn(healthyResponse);

        List<MemberResponse> result = service.getProjectMembers(PROJECT_ID);

        assertThat(result).containsExactly(healthyResponse);
    }
}
