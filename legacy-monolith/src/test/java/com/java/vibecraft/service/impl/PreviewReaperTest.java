package com.java.vibecraft.service.impl;

import com.java.vibecraft.config.PreviewProperties;
import com.java.vibecraft.entity.Preview;
import com.java.vibecraft.entity.PreviewSession;
import com.java.vibecraft.enums.PreviewStatus;
import com.java.vibecraft.error.ExternalServiceException;
import com.java.vibecraft.repository.PreviewRepository;
import com.java.vibecraft.repository.PreviewSessionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PreviewReaperTest {

    private PreviewRepository previewRepository;
    private PreviewSessionRepository sessionRepository;
    private PreviewRunnerPool runnerPool;
    private PreviewRouter router;
    private PreviewLifecycle lifecycle;
    private KubernetesDeploymentServiceImpl deploymentService;
    private PreviewReaper reaper;

    @BeforeEach
    void setUp() {
        previewRepository = mock(PreviewRepository.class);
        sessionRepository = mock(PreviewSessionRepository.class);
        runnerPool = mock(PreviewRunnerPool.class);
        router = mock(PreviewRouter.class);
        lifecycle = mock(PreviewLifecycle.class);
        deploymentService = mock(KubernetesDeploymentServiceImpl.class);
        var properties = new PreviewProperties("ns", "http", "localhost", 8090, 5173, "myminio", "projects",
                Duration.ofMinutes(30), Duration.ofMinutes(6), Duration.ofHours(2));
        reaper = new PreviewReaper(previewRepository, sessionRepository, runnerPool, router, lifecycle, properties,
                deploymentService);
        when(deploymentService.lockFor(any())).thenReturn(new Object());
        when(runnerPool.isAlive(anyString())).thenReturn(true);
        when(runnerPool.claimedPods()).thenReturn(List.of());
        when(router.lastVisit(anyString())).thenReturn(Optional.empty());
        when(sessionRepository.findByEndedAtIsNullAndLastSeenAtBefore(any())).thenReturn(List.of());
    }

    @Test
    @DisplayName("a person whose app hasn't asked about the preview for the idle timeout has their own session ended")
    void endsIdleSessions() {
        when(sessionRepository.findByEndedAtIsNullAndLastSeenAtBefore(any()))
                .thenReturn(List.of(PreviewSession.builder().id(9L).build()));
        when(previewRepository.findByStatusIn(any())).thenReturn(List.of());

        reaper.reap();

        verify(sessionRepository).end(eq(9L), contains("30 minutes"), any());
    }

    @Test
    @DisplayName("a running runner is offered for shutdown - which only happens if nobody has a session on it")
    void offersRunnerForShutdown() {
        Preview runner = running("pod-a");
        when(previewRepository.findByStatusIn(any())).thenReturn(List.of(runner));

        reaper.reap();

        verify(deploymentService).shutDownIfUnused(eq(runner), anyString());
    }

    @Test
    @DisplayName("a preview open in its own tab stays up through the proxy's visit record")
    void proxyVisitKeepsItAlive() {
        Preview openElsewhere = running("pod-a");
        when(previewRepository.findByStatusIn(any())).thenReturn(List.of(openElsewhere));
        when(router.lastVisit(openElsewhere.getHostname())).thenReturn(Optional.of(Instant.now().minusSeconds(20)));

        reaper.reap();

        verify(deploymentService, never()).shutDownIfUnused(any(), any());
        verify(router).refresh(openElsewhere.getHostname());
    }

    @Test
    @DisplayName("a running runner whose pod disappeared is ended")
    void endsRunnerWithMissingPod() {
        Preview orphaned = running("pod-gone");
        when(previewRepository.findByStatusIn(any())).thenReturn(List.of(orphaned));
        when(runnerPool.isAlive("pod-gone")).thenReturn(false);

        reaper.reap();

        verify(lifecycle).terminate(eq(orphaned), contains("stopped unexpectedly"));
    }

    @Test
    @DisplayName("claimed pods no active runner owns are released, but not ones claimed moments ago")
    void sweepsOrphanPods() {
        when(previewRepository.findByStatusIn(any())).thenReturn(List.of(running("pod-owned")));
        when(runnerPool.claimedPods()).thenReturn(List.of(
                new PreviewRunnerPool.ClaimedPod("pod-owned", Instant.now().minus(Duration.ofHours(1))),
                new PreviewRunnerPool.ClaimedPod("pod-leftover", Instant.now().minus(Duration.ofMinutes(10))),
                new PreviewRunnerPool.ClaimedPod("pod-just-claimed", Instant.now().minusSeconds(5))));

        reaper.reap();

        verify(runnerPool).release("pod-leftover");
        verify(runnerPool, never()).release("pod-owned");
        verify(runnerPool, never()).release("pod-just-claimed");
    }

    @Test
    @DisplayName("an unreachable cluster skips the run instead of throwing out of the scheduler")
    void toleratesUnreachableCluster() {
        when(previewRepository.findByStatusIn(any())).thenReturn(List.of(running("pod-a")));
        when(runnerPool.isAlive(anyString())).thenThrow(new ExternalServiceException("down", null));

        assertThatCode(() -> reaper.reap()).doesNotThrowAnyException();
    }

    private static Preview running(String pod) {
        return Preview.builder()
                .id((long) pod.hashCode())
                .projectId(1L)
                .podName(pod)
                .hostname(pod + ".localhost")
                .status(PreviewStatus.RUNNING)
                .lastAccessedAt(Instant.now())
                .build();
    }
}
