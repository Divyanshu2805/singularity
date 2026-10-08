package com.singularity.intelligence.service.impl;

import com.singularity.common.security.AuthUtil;
import com.singularity.intelligence.llm.AiUsageRecorder;
import com.singularity.intelligence.repository.ChatMessageRepository;
import com.singularity.intelligence.repository.ChatSessionRepository;
import com.singularity.intelligence.service.UsageService;
import org.junit.jupiter.api.Test;

import java.time.Clock;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Covers CODE_REVIEW.md SEC-05's intelligence-service half of revoking ongoing work: workspace-service's internal
 * "stop generation" call (InternalIntelligenceController, wired from ProjectServiceImpl.softDelete and
 * ProjectMemberServiceImpl.removeProjectMember) must ask the right turn(s) to stop - every one on the project for a
 * delete, only one member's for a removal - and leave everything else running.
 *
 * <p>Asking is all it does. The thread running a turn notices, records the turn as stopped and removes it from the
 * registry itself, so a turn has exactly one writer; {@link BuildTurnTest} covers that half. A turn already saving is
 * past stopping, and the access recheck before its files commit is what keeps a revoked caller's changes out.
 */
class AiGenerationServiceImplStopGenerationsTest {

    private static final long PROJECT_ID = 1L;
    private static final long USER_A = 10L;
    private static final long USER_B = 20L;

    private final GenerationRegistry registry = new GenerationRegistry(Clock.systemUTC());

    private final AiGenerationServiceImpl service = new AiGenerationServiceImpl(
            mock(AuthUtil.class), mock(ChatSessionRepository.class), mock(ChatMessageRepository.class),
            mock(UsageService.class), mock(AiUsageRecorder.class), registry,
            mock(BuildTurn.class), Runnable::run);

    @Test
    void stoppingWithNoUserAsksEveryTurnOnTheProjectToStopButNotOtherProjects() {
        ActiveGeneration onThisProject = registry.start(PROJECT_ID, USER_A, "build a form");
        ActiveGeneration onAnotherProject = registry.start(2L, USER_A, "build a nav");

        service.stopGenerationsForProject(PROJECT_ID, null);

        assertThat(onThisProject.stopRequested()).isTrue();
        assertThat(onAnotherProject.stopRequested()).isFalse();
    }

    @Test
    void stoppingWithAUserOnlyStopsTheirsNotAnUnrelatedGenerationOnAnotherProject() {
        ActiveGeneration removedMembersRun = registry.start(PROJECT_ID, USER_A, "build a form");
        ActiveGeneration unrelatedProjectsRun = registry.start(2L, USER_B, "build a table");

        service.stopGenerationsForProject(PROJECT_ID, USER_A);

        assertThat(removedMembersRun.stopRequested()).isTrue();
        assertThat(unrelatedProjectsRun.stopRequested()).isFalse();
    }

    @Test
    void stoppingWithAUserThatIsNotTheOneRunningLeavesTheActualGenerationAlone() {
        ActiveGeneration actuallyRunning = registry.start(PROJECT_ID, USER_B, "build a table");

        service.stopGenerationsForProject(PROJECT_ID, USER_A);

        assertThat(actuallyRunning.stopRequested()).isFalse();
        assertThat(registry.find(PROJECT_ID, USER_B)).contains(actuallyRunning);
    }

    @Test
    void aTurnThatIsAlreadySavingIsLeftToFinish() {
        ActiveGeneration saving = registry.start(PROJECT_ID, USER_A, "build a form");
        saving.beginSaving();

        service.stopGenerationsForProject(PROJECT_ID, USER_A);

        assertThat(saving.stopRequested()).isFalse();
        assertThat(saving.status()).isEqualTo(ActiveGeneration.Status.SAVING);
    }

    @Test
    void stoppingWhenNothingIsRunningIsANoOp() {
        service.stopGenerationsForProject(PROJECT_ID, USER_A);

        assertThat(registry.find(PROJECT_ID, USER_A)).isEmpty();
    }
}
