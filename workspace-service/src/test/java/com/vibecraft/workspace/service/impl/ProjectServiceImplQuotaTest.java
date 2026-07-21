package com.vibecraft.workspace.service.impl;

import com.vibecraft.common.dto.PlanDto;
import com.vibecraft.common.error.QuotaExceededException;
import com.vibecraft.workspace.dto.project.CreateProjectFromPromptRequest;
import com.vibecraft.workspace.dto.project.ProjectRequest;
import com.vibecraft.workspace.feign.AccountServiceClient;
import com.vibecraft.workspace.mapper.ProjectMapper;
import com.vibecraft.workspace.repository.ProjectMemberRepository;
import com.vibecraft.workspace.repository.ProjectRepository;
import com.vibecraft.workspace.security.AuthUtil;
import com.vibecraft.workspace.service.ProjectFileService;
import com.vibecraft.workspace.service.ProjectTemplateService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The project-count limit spans two services: the allowance is account-service's (over Feign), the count owned is
 * this service's own table. At the limit a create must be refused with a 402 that carries the numbers, before
 * anything is written. This is the one quota path that can't reasonably be exercised live (it would mean creating
 * up to ten real projects), so it is pinned here.
 */
class ProjectServiceImplQuotaTest {

    private static final long USER_ID = 7L;

    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final ProjectMemberRepository projectMemberRepository = mock(ProjectMemberRepository.class);
    private final AuthUtil authUtil = mock(AuthUtil.class);
    private final AccountServiceClient accountServiceClient = mock(AccountServiceClient.class);

    private final ProjectServiceImpl service = new ProjectServiceImpl(
            projectRepository, mock(ProjectMapper.class), projectMemberRepository, authUtil, accountServiceClient,
            mock(ProjectTemplateService.class), mock(ProjectFileService.class));

    private void plan(String name, int maxProjects, int owned) {
        when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
        when(accountServiceClient.getPlanLimits(USER_ID)).thenReturn(new PlanDto(1L, name, maxProjects, 100_000, 3, false));
        when(projectMemberRepository.countProjectOwnedByUser(USER_ID)).thenReturn(owned);
    }

    @Test
    @DisplayName("at the plan's project limit, create is refused with a PROJECT_LIMIT quota carrying the numbers")
    void refusedAtTheLimit() {
        plan("Pro", 3, 3);

        assertThatThrownBy(() -> service.createProject(new ProjectRequest("another")))
                .isInstanceOfSatisfying(QuotaExceededException.class, e -> {
                    assertThat(e.getReason()).isEqualTo(QuotaExceededException.Reason.PROJECT_LIMIT);
                    assertThat(e.getLimit()).isEqualTo(3);
                    assertThat(e.getUsed()).isEqualTo(3);
                    assertThat(e.getPlanName()).isEqualTo("Pro");
                    assertThat(e.getMessage()).contains("Pro plan includes 3 projects");
                });

        verify(projectRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    @DisplayName("over the limit (e.g. after a downgrade) is refused too, not just exactly at it")
    void refusedWhenOverTheLimit() {
        plan("Free", 1, 4);

        assertThatThrownBy(() -> service.createProject(new ProjectRequest("another")))
                .isInstanceOfSatisfying(QuotaExceededException.class, e -> {
                    assertThat(e.getLimit()).isEqualTo(1);
                    assertThat(e.getUsed()).isEqualTo(4);
                    assertThat(e.getMessage()).as("singular for a one-project plan").contains("Free plan includes 1 project.");
                });
    }

    @Test
    @DisplayName("create-from-prompt is refused at the limit too, before any project is written")
    void fromPromptRefusedAtTheLimit() {
        plan("Free", 1, 1);

        assertThatThrownBy(() -> service.createProjectFromPrompt(new CreateProjectFromPromptRequest("a habit tracker")))
                .isInstanceOf(QuotaExceededException.class);

        verify(projectRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }
}
