package com.singularity.workspace.service.impl;

import com.singularity.common.security.AuthUtil;
import com.singularity.workspace.dto.project.CreateProjectFromPromptRequest;
import com.singularity.workspace.dto.project.ForkProjectRequest;
import com.singularity.workspace.dto.project.ProjectRequest;
import com.singularity.workspace.entity.Project;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers a project's title - the line the sidebar, the project's header, its card and search show.
 *
 * <p>Handles: a rename setting the title to what was typed along with the name, so the sidebar and the header change
 * together; a project made from an idea keeping the interview model's title, and having none when no model wrote one;
 * a fork keeping its original's title marked as a fork, or taking the name it was given; and a model's title being
 * stored, cut to size, only through the update that leaves an already-titled project alone.
 */
class ProjectServiceImplTitleTest {

    private static final long PROJECT_ID = 3L;
    private static final long USER_ID = 7L;

    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final ProjectMemberRepository projectMemberRepository = mock(ProjectMemberRepository.class);
    private final AuthUtil authUtil = mock(AuthUtil.class);
    private final ProjectTemplateService projectTemplateService = mock(ProjectTemplateService.class);
    private final ProjectFileService projectFileService = mock(ProjectFileService.class);

    private final ProjectServiceImpl service = new ProjectServiceImpl(
            projectRepository, mock(ProjectMapper.class), projectMemberRepository, authUtil,
            mock(ProjectQuota.class), projectTemplateService, projectFileService, mock(PreviewDeploymentService.class),
            mock(IntelligenceServiceClient.class), mock(PublishService.class));

    @BeforeEach
    void setUp() {
        when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
        when(projectRepository.save(any(Project.class))).thenAnswer(call -> {
            Project project = call.getArgument(0);
            if (project.getId() == null) project.setId(99L);
            return project;
        });
        when(projectTemplateService.initializeProjectFromTemplate(anyLong())).thenReturn(new TemplateInitResult(3, 0, List.of()));
    }

    private Project saved() {
        ArgumentCaptor<Project> captor = ArgumentCaptor.forClass(Project.class);
        verify(projectRepository, atLeastOnce()).save(captor.capture());
        return captor.getValue();
    }

    private void member(Project project, ProjectRole role) {
        when(projectRepository.findAccessibleProjectById(project.getId(), USER_ID)).thenReturn(Optional.of(project));
        when(projectMemberRepository.findRoleByProjectIdAndUserId(project.getId(), USER_ID)).thenReturn(Optional.of(role));
    }

    @Test
    @DisplayName("a rename sets the title to what was typed, so the sidebar and the header change together")
    void aRenameSetsTheTitle() {
        member(Project.builder().id(PROJECT_ID).name("Notes").summary("Notes that save as you type").build(), ProjectRole.OWNER);

        service.updateProject(PROJECT_ID, new ProjectRequest("Divyanshu's notes"));

        assertThat(saved().getName()).isEqualTo("Divyanshu's notes");
        assertThat(saved().getSummary()).isEqualTo("Divyanshu's notes");
    }

    @Test
    @DisplayName("a project made from an idea keeps the interview model's title, and has none when no model wrote one")
    void aProjectFromAnIdeaKeepsTheModelsTitle() {
        service.createProjectFromPrompt(new CreateProjectFromPromptRequest("a kanban board", "Kanban", "Kanban board for one person's tasks"));
        assertThat(saved().getSummary()).isEqualTo("Kanban board for one person's tasks");

        service.createProjectFromPrompt(new CreateProjectFromPromptRequest("A digital guestbook that lets anyone sign it.", null, null));
        assertThat(saved().getName()).isEqualTo("Digital guestbook");
        assertThat(saved().getSummary()).isNull();
    }

    @Test
    @DisplayName("a fork keeps its original's title marked as a fork, or takes the name it was given for both")
    void aForkKeepsTheTitleMarked() {
        Project original = Project.builder().id(PROJECT_ID).name("Kanban").summary("Kanban board for one person's tasks").build();
        member(original, ProjectRole.EDITOR);

        service.forkProject(PROJECT_ID, null);
        assertThat(saved().getName()).isEqualTo("Kanban (fork)");
        assertThat(saved().getSummary()).isEqualTo("Kanban board for one person's tasks (fork)");

        service.forkProject(PROJECT_ID, new ForkProjectRequest("  My board  "));
        assertThat(saved().getName()).isEqualTo("My board");
        assertThat(saved().getSummary()).isEqualTo("My board");

        original.setSummary(null);
        service.forkProject(PROJECT_ID, null);
        assertThat(saved().getSummary()).isNull();
    }

    @Test
    @DisplayName("a model's title is stored cut to size, only while the project has none, and the stored one is returned")
    void aModelsTitleIsStoredOnlyWhileUntitled() {
        when(projectRepository.setSummaryIfUntitled(PROJECT_ID, "Kanban board for one person's tasks")).thenReturn(1);
        when(projectRepository.findSummary(PROJECT_ID)).thenReturn(Optional.of("Kanban board for one person's tasks"));

        assertThat(service.titleIfUntitled(PROJECT_ID, "**Kanban board for one person's tasks**\nand more"))
                .isEqualTo("Kanban board for one person's tasks");
        verify(projectRepository, never()).save(any());
    }

    @Test
    @DisplayName("an empty title changes nothing, and a project with a title keeps it")
    void anEmptyTitleChangesNothing() {
        when(projectRepository.findSummary(PROJECT_ID)).thenReturn(Optional.of("Divyanshu's notes"));

        assertThat(service.titleIfUntitled(PROJECT_ID, "  ")).isEqualTo("Divyanshu's notes");
        verify(projectRepository, never()).setSummaryIfUntitled(anyLong(), anyString());
    }
}
