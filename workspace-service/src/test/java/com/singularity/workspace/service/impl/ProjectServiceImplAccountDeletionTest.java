package com.singularity.workspace.service.impl;

import com.singularity.common.security.AuthUtil;
import com.singularity.workspace.entity.Project;
import com.singularity.workspace.entity.ProjectMember;
import com.singularity.workspace.entity.ProjectMemberId;
import com.singularity.workspace.enums.ProjectRole;
import com.singularity.workspace.feign.IntelligenceServiceClient;
import com.singularity.workspace.mapper.ProjectMapper;
import com.singularity.workspace.repository.ProjectMemberRepository;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.service.PreviewDeploymentService;
import com.singularity.workspace.service.ProjectFileService;
import com.singularity.workspace.service.ProjectTemplateService;
import com.singularity.workspace.service.PublishService;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Removing every project of an account that is being deleted: each owned project is deleted for everyone exactly as
 * its owner deleting it would, each other project is left exactly as leaving it would, and a project already deleted
 * is left alone. Each project is read afresh by id rather than through the membership, since a preview stop between
 * two of them clears the persistence context.
 */
class ProjectServiceImplAccountDeletionTest {

    private static final long USER_ID = 10L;
    private static final long OWNED_ID = 1L;
    private static final long SHARED_ID = 2L;
    private static final long DELETED_ID = 3L;

    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final ProjectMemberRepository projectMemberRepository = mock(ProjectMemberRepository.class);
    private final PreviewDeploymentService previewDeploymentService = mock(PreviewDeploymentService.class);
    private final IntelligenceServiceClient intelligenceServiceClient = mock(IntelligenceServiceClient.class);
    private final PublishService publishService = mock(PublishService.class);

    private final ProjectServiceImpl service = new ProjectServiceImpl(
            projectRepository, mock(ProjectMapper.class), projectMemberRepository, mock(AuthUtil.class),
            mock(ProjectQuota.class), mock(ProjectTemplateService.class), mock(ProjectFileService.class),
            previewDeploymentService, intelligenceServiceClient, publishService);

    private static ProjectMember membership(long projectId, ProjectRole role) {
        return ProjectMember.builder().id(new ProjectMemberId(projectId, USER_ID)).projectRole(role).build();
    }

    @Test
    void deletesOwnedProjectsLeavesSharedOnesAndSkipsDeletedOnes() {
        Project owned = Project.builder().id(OWNED_ID).name("mine").build();
        Project shared = Project.builder().id(SHARED_ID).name("theirs").build();
        Project deleted = Project.builder().id(DELETED_ID).name("gone").deletedAt(Instant.EPOCH).build();
        when(projectMemberRepository.findByIdUserId(USER_ID)).thenReturn(List.of(
                membership(OWNED_ID, ProjectRole.OWNER),
                membership(SHARED_ID, ProjectRole.EDITOR),
                membership(DELETED_ID, ProjectRole.OWNER)));
        when(projectRepository.findById(OWNED_ID)).thenReturn(Optional.of(owned));
        when(projectRepository.findById(SHARED_ID)).thenReturn(Optional.of(shared));
        when(projectRepository.findById(DELETED_ID)).thenReturn(Optional.of(deleted));

        service.removeAllForUser(USER_ID);

        assertThat(owned.getDeletedAt()).isNotNull();
        verify(previewDeploymentService).stopAllForProject(eq(OWNED_ID), anyString());
        verify(publishService).takeDown(OWNED_ID);

        assertThat(shared.getDeletedAt()).isNull();
        verify(projectMemberRepository).deleteById(new ProjectMemberId(SHARED_ID, USER_ID));
        verify(previewDeploymentService).endSessionForUser(eq(SHARED_ID), eq(USER_ID), anyString());
        verify(publishService, never()).takeDown(SHARED_ID);

        assertThat(deleted.getDeletedAt()).isEqualTo(Instant.EPOCH);
        verify(previewDeploymentService, never()).stopAllForProject(eq(DELETED_ID), anyString());
        verify(publishService, never()).takeDown(DELETED_ID);
    }

    @Test
    void anAccountWithNoProjectsChangesNothing() {
        when(projectMemberRepository.findByIdUserId(USER_ID)).thenReturn(List.of());

        service.removeAllForUser(USER_ID);

        verify(projectRepository, never()).save(any());
        verify(projectMemberRepository, never()).deleteById(any());
    }
}
