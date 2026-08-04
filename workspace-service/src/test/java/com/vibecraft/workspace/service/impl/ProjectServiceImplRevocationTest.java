package com.vibecraft.workspace.service.impl;

import com.vibecraft.common.feign.AccountServiceClient;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.workspace.entity.Project;
import com.vibecraft.workspace.entity.ProjectMemberId;
import com.vibecraft.workspace.enums.ProjectRole;
import com.vibecraft.workspace.feign.IntelligenceServiceClient;
import com.vibecraft.workspace.mapper.ProjectMapper;
import com.vibecraft.workspace.repository.ProjectMemberRepository;
import com.vibecraft.workspace.repository.ProjectRepository;
import com.vibecraft.workspace.service.PreviewDeploymentService;
import com.vibecraft.workspace.service.ProjectFileService;
import com.vibecraft.workspace.service.ProjectTemplateService;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers CODE_REVIEW.md SEC-05's workspace-service half: a project delete or a member's own departure must revoke
 * standing immediately, not just membership - stopping in-flight generation and ending preview sessions the deleted
 * project or lost membership can no longer authorize. (intelligence-service's own recheck before committing, covered
 * separately by AiGenerationServiceImplTest-style unit tests, is the backstop if either call below never arrives.)
 */
class ProjectServiceImplRevocationTest {

    private static final long PROJECT_ID = 1L;
    private static final long OWNER_ID = 10L;
    private static final long EDITOR_ID = 20L;

    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final ProjectMemberRepository projectMemberRepository = mock(ProjectMemberRepository.class);
    private final AuthUtil authUtil = mock(AuthUtil.class);
    private final PreviewDeploymentService previewDeploymentService = mock(PreviewDeploymentService.class);
    private final IntelligenceServiceClient intelligenceServiceClient = mock(IntelligenceServiceClient.class);

    private final ProjectServiceImpl service = new ProjectServiceImpl(
            projectRepository, mock(ProjectMapper.class), projectMemberRepository, authUtil,
            mock(AccountServiceClient.class), mock(ProjectTemplateService.class), mock(ProjectFileService.class),
            previewDeploymentService, intelligenceServiceClient);

    @Test
    void ownerDeletingTheProjectStopsEveryGenerationAndPreviewForIt() {
        Project project = Project.builder().id(PROJECT_ID).name("demo").build();
        when(authUtil.getCurrentUserId()).thenReturn(OWNER_ID);
        when(projectRepository.findAccessibleProjectById(PROJECT_ID, OWNER_ID)).thenReturn(Optional.of(project));
        when(projectMemberRepository.findRoleByProjectIdAndUserId(PROJECT_ID, OWNER_ID))
                .thenReturn(Optional.of(ProjectRole.OWNER));

        service.softDelete(PROJECT_ID);

        verify(intelligenceServiceClient).stopGeneration(eq(PROJECT_ID), isNull());
        verify(previewDeploymentService).stopAllForProject(eq(PROJECT_ID), anyString());
        verify(previewDeploymentService, never()).endSessionForUser(any(), any(), anyString());
    }

    @Test
    void aNonOwnerLeavingOnlyRevokesTheirOwnStanding() {
        Project project = Project.builder().id(PROJECT_ID).name("demo").build();
        when(authUtil.getCurrentUserId()).thenReturn(EDITOR_ID);
        when(projectRepository.findAccessibleProjectById(PROJECT_ID, EDITOR_ID)).thenReturn(Optional.of(project));
        when(projectMemberRepository.findRoleByProjectIdAndUserId(PROJECT_ID, EDITOR_ID))
                .thenReturn(Optional.of(ProjectRole.EDITOR));

        service.softDelete(PROJECT_ID);

        verify(projectMemberRepository).deleteById(new ProjectMemberId(PROJECT_ID, EDITOR_ID));
        verify(intelligenceServiceClient).stopGeneration(PROJECT_ID, EDITOR_ID);
        verify(previewDeploymentService).endSessionForUser(eq(PROJECT_ID), eq(EDITOR_ID), anyString());
        verify(previewDeploymentService, never()).stopAllForProject(any(), anyString());
        verify(projectRepository, never()).save(any());
    }

    @Test
    void aFailureToReachIntelligenceServiceDoesNotBlockTheDelete() {
        Project project = Project.builder().id(PROJECT_ID).name("demo").build();
        when(authUtil.getCurrentUserId()).thenReturn(OWNER_ID);
        when(projectRepository.findAccessibleProjectById(PROJECT_ID, OWNER_ID)).thenReturn(Optional.of(project));
        when(projectMemberRepository.findRoleByProjectIdAndUserId(PROJECT_ID, OWNER_ID))
                .thenReturn(Optional.of(ProjectRole.OWNER));
        org.mockito.Mockito.doThrow(new RuntimeException("intelligence-service unreachable"))
                .when(intelligenceServiceClient).stopGeneration(eq(PROJECT_ID), isNull());

        service.softDelete(PROJECT_ID);

        verify(projectRepository).save(project);
        verify(previewDeploymentService).stopAllForProject(eq(PROJECT_ID), anyString());
    }
}
