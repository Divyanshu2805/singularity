package com.vibecraft.workspace.service.impl;

import com.vibecraft.common.dto.PlanDto;
import com.vibecraft.common.error.QuotaExceededException;
import com.vibecraft.common.feign.AccountServiceClient;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.workspace.config.PreviewProperties;
import com.vibecraft.workspace.entity.Preview;
import com.vibecraft.workspace.entity.PreviewSession;
import com.vibecraft.workspace.entity.Project;
import com.vibecraft.workspace.enums.PreviewStatus;
import com.vibecraft.workspace.repository.PreviewRepository;
import com.vibecraft.workspace.repository.PreviewSessionRepository;
import com.vibecraft.workspace.repository.ProjectRepository;
import io.fabric8.kubernetes.api.model.Pod;
import io.fabric8.kubernetes.api.model.PodBuilder;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Covers CODE_REVIEW.md DATA-02's preview half: the plan's concurrent-preview allowance is per user across every
 * project they can see, but {@code startPreview} used to lock only per project - two starts on two different
 * projects by the same user, racing, could each see "0 of 1 used" and both be admitted, one more preview than the
 * plan allows. This forces that exact interleaving with a latch and proves only one of the two survives once
 * startPreview locks per user first.
 */
class PreviewDeploymentServiceImplQuotaRaceTest {

    private static final long USER_ID = 42L;
    private static final long PROJECT_A = 1L;
    private static final long PROJECT_B = 2L;

    private final PreviewRepository previewRepository = mock(PreviewRepository.class);
    private final PreviewSessionRepository sessionRepository = mock(PreviewSessionRepository.class);
    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final PreviewRunnerPool runnerPool = mock(PreviewRunnerPool.class);
    private final PreviewRouter router = mock(PreviewRouter.class);
    private final PreviewBootstrapper bootstrapper = mock(PreviewBootstrapper.class);
    private final PreviewLifecycle lifecycle = mock(PreviewLifecycle.class);
    private final AccountServiceClient accountServiceClient = mock(AccountServiceClient.class);
    private final AuthUtil authUtil = mock(AuthUtil.class);

    private final PreviewProperties properties = new PreviewProperties(
            "vibecraft-ai", "http", "localhost", null, 5173, "myminio", "projects",
            Duration.ofMinutes(10), Duration.ofMinutes(2), Duration.ofSeconds(90),
            "test-secret-at-least-32-bytes-long-000000", Duration.ofHours(6));

    private final PreviewDeploymentServiceImpl service = new PreviewDeploymentServiceImpl(
            previewRepository, sessionRepository, projectRepository, runnerPool, router, bootstrapper, lifecycle,
            properties, accountServiceClient, authUtil);

    private final AtomicInteger activeSessions = new AtomicInteger(0);
    private final CountDownLatch bothArrivedAtCountCheck = new CountDownLatch(2);

    private void stubProject(long projectId) {
        when(projectRepository.findById(projectId))
                .thenReturn(Optional.of(Project.builder().id(projectId).build()));
    }

    private void stubNoExistingRunnerOrSession(long projectId) {
        when(previewRepository.findFirstByProjectIdAndStatusInOrderByIdDesc(eq(projectId), any())).thenReturn(Optional.empty());
        when(sessionRepository.findFirstByProjectIdAndUserIdAndEndedAtIsNullOrderByIdDesc(projectId, USER_ID)).thenReturn(Optional.empty());
        when(previewRepository.findLatestHostname(projectId)).thenReturn(Optional.empty());
    }

    @Test
    void onlyOneOfTwoConcurrentStartsOnDifferentProjectsIsAdmittedAtTheLimit() throws Exception {
        when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
        when(accountServiceClient.getPlanLimits(USER_ID)).thenReturn(new PlanDto(1L, "Free", 1, 10_000, 1, false));

        stubProject(PROJECT_A);
        stubProject(PROJECT_B);
        stubNoExistingRunnerOrSession(PROJECT_A);
        stubNoExistingRunnerOrSession(PROJECT_B);

        Pod podA = new PodBuilder().withNewMetadata().withName("runner-a").endMetadata().build();
        Pod podB = new PodBuilder().withNewMetadata().withName("runner-b").endMetadata().build();
        when(runnerPool.claim(PROJECT_A)).thenReturn(Optional.of(podA));
        when(runnerPool.claim(PROJECT_B)).thenReturn(Optional.of(podB));

        when(previewRepository.save(any())).thenAnswer(invocation -> {
            Preview preview = invocation.getArgument(0);
            preview.setId(preview.getProject().getId());
            return preview;
        });

        // The race: both threads must reach the quota count check before either is allowed to record a session,
        // so whichever code path fails to serialize them will let both see "0 sessions used" simultaneously.
        when(sessionRepository.countByUserIdAndEndedAtIsNull(USER_ID)).thenAnswer(invocation -> {
            int seenSoFar = activeSessions.get();
            bothArrivedAtCountCheck.countDown();
            // Only matters if the lock actually lets both threads reach this point together (the bug this test
            // guards against); under correct per-user serialization the second thread can't get here until the
            // first has already finished, so this always times out for whichever thread runs first - by design.
            bothArrivedAtCountCheck.await(300, TimeUnit.MILLISECONDS);
            return seenSoFar;
        });
        when(sessionRepository.save(any())).thenAnswer(invocation -> {
            activeSessions.incrementAndGet();
            PreviewSession session = invocation.getArgument(0);
            session.setId(1L);
            return session;
        });

        CompletableFuture<Object> startA = CompletableFuture.supplyAsync(() -> attemptStart(PROJECT_A));
        CompletableFuture<Object> startB = CompletableFuture.supplyAsync(() -> attemptStart(PROJECT_B));

        Object resultA = startA.get(5, TimeUnit.SECONDS);
        Object resultB = startB.get(5, TimeUnit.SECONDS);

        List<Object> results = List.of(resultA, resultB);
        long succeeded = results.stream().filter(r -> !(r instanceof QuotaExceededException)).count();
        long refused = results.stream().filter(r -> r instanceof QuotaExceededException).count();

        assertThat(succeeded).as("exactly one of the two concurrent starts should be admitted at a 1-preview limit").isEqualTo(1);
        assertThat(refused).isEqualTo(1);
    }

    private Object attemptStart(long projectId) {
        try {
            return service.startPreview(projectId);
        } catch (QuotaExceededException e) {
            return e;
        }
    }
}
