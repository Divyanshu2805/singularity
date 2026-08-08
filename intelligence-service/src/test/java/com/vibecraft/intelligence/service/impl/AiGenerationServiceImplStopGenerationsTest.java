package com.vibecraft.intelligence.service.impl;

import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.intelligence.feign.WorkspaceServiceClient;
import com.vibecraft.intelligence.llm.AiUsageRecorder;
import com.vibecraft.intelligence.llm.LlmResponseParser;
import com.vibecraft.intelligence.llm.advisors.FileTreeContextAdvisor;
import com.vibecraft.intelligence.repository.ChatEventRepository;
import com.vibecraft.intelligence.repository.ChatMessageRepository;
import com.vibecraft.intelligence.repository.ChatSessionRepository;
import com.vibecraft.intelligence.service.ProjectFileReader;
import com.vibecraft.intelligence.service.UsageService;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers CODE_REVIEW.md SEC-05's intelligence-service half of revoking ongoing work: workspace-service's internal
 * "stop generation" call (InternalIntelligenceController, wired from ProjectServiceImpl.softDelete and
 * ProjectMemberServiceImpl.removeProjectMember) must stop the right generation(s) - the whole project on a delete,
 * only one member's on a removal - and always clear the registry, even for one already past RUNNING.
 */
class AiGenerationServiceImplStopGenerationsTest {

    private static final long PROJECT_ID = 1L;
    private static final long USER_A = 10L;
    private static final long USER_B = 20L;

    private final GenerationRegistry registry = new GenerationRegistry();

    private final AiGenerationServiceImpl service = new AiGenerationServiceImpl(
            org.mockito.Mockito.mock(ChatClient.class),
            org.mockito.Mockito.mock(AuthUtil.class),
            org.mockito.Mockito.mock(WorkspaceServiceClient.class),
            org.mockito.Mockito.mock(ProjectFileReader.class),
            org.mockito.Mockito.mock(FileTreeContextAdvisor.class),
            org.mockito.Mockito.mock(ChatSessionRepository.class),
            org.mockito.Mockito.mock(LlmResponseParser.class),
            org.mockito.Mockito.mock(ChatMessageRepository.class),
            org.mockito.Mockito.mock(ChatEventRepository.class),
            org.mockito.Mockito.mock(UsageService.class),
            org.mockito.Mockito.mock(AiUsageRecorder.class),
            registry);

    @Test
    void stoppingWithNoUserStopsTheProjectsGenerationButNotOtherProjects() {
        registry.start(PROJECT_ID, USER_A, "build a form", false);
        ActiveGeneration onAnotherProject = registry.start(2L, USER_A, "build a nav", false);

        service.stopGenerationsForProject(PROJECT_ID, null);

        assertThat(registry.find(PROJECT_ID, USER_A)).isEmpty();
        assertThat(registry.find(2L, USER_A)).contains(onAnotherProject);
    }

    @Test
    void stoppingWithAUserOnlyStopsTheirsNotAnUnrelatedGenerationOnAnotherProject() {
        ActiveGeneration removedMembersRun = registry.start(PROJECT_ID, USER_A, "build a form", false);
        ActiveGeneration unrelatedProjectsRun = registry.start(2L, USER_B, "build a table", false);

        service.stopGenerationsForProject(PROJECT_ID, USER_A);

        assertThat(registry.find(PROJECT_ID, USER_A)).isEmpty();
        assertThat(registry.find(2L, USER_B)).contains(unrelatedProjectsRun);
        assertThat(unrelatedProjectsRun.status()).isEqualTo(ActiveGeneration.Status.RUNNING);
    }

    @Test
    void stoppingWithAUserThatIsNotTheOneRunningLeavesTheActualGenerationAlone() {
        ActiveGeneration actuallyRunning = registry.start(PROJECT_ID, USER_B, "build a table", false);

        service.stopGenerationsForProject(PROJECT_ID, USER_A);

        assertThat(registry.find(PROJECT_ID, USER_B)).contains(actuallyRunning);
        assertThat(actuallyRunning.status()).isEqualTo(ActiveGeneration.Status.RUNNING);
    }

    @Test
    void stoppingOneAlreadyPastRunningStillClearsTheRegistryWithoutError() {
        ActiveGeneration generation = registry.start(PROJECT_ID, USER_A, "build a form", false);
        generation.markStreamComplete();

        service.stopGenerationsForProject(PROJECT_ID, USER_A);

        assertThat(registry.find(PROJECT_ID, USER_A)).isEmpty();
    }

    @Test
    void stoppingWhenNothingIsRunningIsANoOp() {
        service.stopGenerationsForProject(PROJECT_ID, USER_A);

        assertThat(registry.find(PROJECT_ID, USER_A)).isEmpty();
    }
}
