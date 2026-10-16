package com.singularity.workspace.service.impl;

import com.singularity.common.security.AuthUtil;
import com.singularity.workspace.entity.Project;
import com.singularity.workspace.entity.ProjectMember;
import com.singularity.workspace.enums.ProjectRole;
import com.singularity.workspace.feign.IntelligenceServiceClient;
import com.singularity.workspace.mapper.ProjectMapper;
import com.singularity.workspace.repository.ProjectMemberRepository;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.service.PreviewDeploymentService;
import com.singularity.workspace.service.ProjectFileService;
import com.singularity.workspace.service.ProjectTemplateService;
import com.singularity.workspace.service.PublishService;
import com.singularity.workspace.service.TemplateInitResult;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The shared demo account's sample project: made from the starter template for the user account-service names, owned
 * by them and titled as its first build is, with no signed-in caller and no plan quota in the way.
 */
class ProjectServiceImplDemoProjectTest {

    private static final long USER_ID = 12L;
    private static final long PROJECT_ID = 40L;
    private static final String TITLE = "Quick notes you can jot and clear";

    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final ProjectMemberRepository projectMemberRepository = mock(ProjectMemberRepository.class);
    private final AuthUtil authUtil = mock(AuthUtil.class);
    private final ProjectQuota projectQuota = mock(ProjectQuota.class);
    private final ProjectTemplateService projectTemplateService = mock(ProjectTemplateService.class);

    private final ProjectServiceImpl service = new ProjectServiceImpl(
            projectRepository, mock(ProjectMapper.class), projectMemberRepository, authUtil, projectQuota,
            projectTemplateService, mock(ProjectFileService.class), mock(PreviewDeploymentService.class),
            mock(IntelligenceServiceClient.class), mock(PublishService.class));

    @Test
    void makesATitledProjectFromTheTemplateOwnedByTheDemoUser() {
        when(projectRepository.save(any(Project.class))).thenAnswer(call -> {
            Project project = call.getArgument(0);
            project.setId(PROJECT_ID);
            return project;
        });
        when(projectTemplateService.initializeProjectFromTemplate(PROJECT_ID))
                .thenReturn(new TemplateInitResult(20, 0, List.of()));

        assertThat(service.createDemoProject(USER_ID, TITLE)).isEqualTo(PROJECT_ID);

        ArgumentCaptor<Project> project = ArgumentCaptor.forClass(Project.class);
        verify(projectRepository).save(project.capture());
        assertThat(project.getValue().getSummary()).isEqualTo(TITLE);
        assertThat(project.getValue().getName()).isNotBlank();
        ArgumentCaptor<ProjectMember> owner = ArgumentCaptor.forClass(ProjectMember.class);
        verify(projectMemberRepository).save(owner.capture());
        assertThat(owner.getValue().getId().getUserId()).isEqualTo(USER_ID);
        assertThat(owner.getValue().getProjectRole()).isEqualTo(ProjectRole.OWNER);
        verify(projectTemplateService).initializeProjectFromTemplate(PROJECT_ID);
        verifyNoInteractions(authUtil, projectQuota);
    }
}
