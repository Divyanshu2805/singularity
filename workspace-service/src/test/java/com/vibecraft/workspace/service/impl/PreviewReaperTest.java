package com.vibecraft.workspace.service.impl;

import com.vibecraft.workspace.config.InstanceId;
import com.vibecraft.workspace.config.PreviewProperties;
import com.vibecraft.workspace.entity.Preview;
import com.vibecraft.workspace.enums.PreviewStatus;
import com.vibecraft.workspace.repository.PreviewRepository;
import com.vibecraft.workspace.repository.PreviewSessionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static com.vibecraft.workspace.service.impl.PreviewDeploymentServiceImpl.ACTIVE;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers CODE_REVIEW.md PRE-02 and PRE-06.
 *
 * <p>PRE-02: a preview the reaper is about to revive a lost route for might have been stopped, by someone holding
 * the project's lock, in the instant between {@link PreviewReaper#reap()} fetching its snapshot and this preview's
 * turn in the loop coming up. Reviving the route anyway would resurrect one nothing will ever clean up again, since
 * a terminated preview drops out of every later reap run's active list.
 *
 * <p>PRE-06: a pod staying "Running" says nothing about the dev server or file-sync watcher inside it - a crashed
 * dev server (an unambiguous exit code) is failed on the first sighting, one that merely stops answering gets a few
 * misses' grace before being treated as wedged, and a dead watcher is relaunched rather than ending an otherwise
 * working preview.
 */
class PreviewReaperTest {

    private static final long PROJECT_ID = 5L;
    private static final long PREVIEW_ID = 1L;

    private final PreviewRepository previewRepository = mock(PreviewRepository.class);
    private final PreviewSessionRepository sessionRepository = mock(PreviewSessionRepository.class);
    private final PreviewRunnerPool runnerPool = mock(PreviewRunnerPool.class);
    private final PreviewRouter router = mock(PreviewRouter.class);
    private final PreviewBootstrapper bootstrapper = mock(PreviewBootstrapper.class);
    private final PreviewLifecycle lifecycle = mock(PreviewLifecycle.class);
    private final PreviewDeploymentServiceImpl deploymentService = mock(PreviewDeploymentServiceImpl.class);
    private final InstanceId instanceId = mock(InstanceId.class);

    private final PreviewProperties properties = new PreviewProperties(
            "vibecraft-ai", "http", "localhost", null, 5173, "local", "projects",
            Duration.ofMinutes(30), Duration.ofMinutes(2), Duration.ofMinutes(5), "secret", Duration.ofHours(6));

    private final PreviewReaper reaper = new PreviewReaper(previewRepository, sessionRepository, runnerPool, router,
            bootstrapper, lifecycle, properties, deploymentService, instanceId);

    private static final PreviewBootstrapper.HealthCheck HEALTHY = new PreviewBootstrapper.HealthCheck(true, true, true);

    @BeforeEach
    void stubUnrelatedReapWork() {
        when(sessionRepository.findByEndedAtIsNullAndLastSeenAtBefore(any())).thenReturn(List.of());
        when(runnerPool.claimedPods()).thenReturn(List.of());
        when(deploymentService.lockFor(PROJECT_ID)).thenReturn(new Object());
        when(bootstrapper.checkHealth(any())).thenReturn(HEALTHY);
    }

    private static Preview preview(PreviewStatus status, String podName, String hostname) {
        return Preview.builder().id(PREVIEW_ID).projectId(PROJECT_ID).status(status)
                .podName(podName).hostname(hostname).build();
    }

    @Test
    void aPreviewStoppedByAConcurrentActionIsNotRevivedEvenIfTheSnapshotStillCallsItRunning() {
        Preview snapshotTakenBeforeTheStop = preview(PreviewStatus.RUNNING, "pod-a", "host-a");
        when(previewRepository.findByStatusIn(ACTIVE)).thenReturn(List.of(snapshotTakenBeforeTheStop));
        // By the time this preview's turn comes up in the loop, someone already stopped it for real.
        when(previewRepository.findById(PREVIEW_ID))
                .thenReturn(Optional.of(preview(PreviewStatus.TERMINATED, "pod-a", "host-a")));

        reaper.reap();

        verify(runnerPool, never()).isAlive(any());
        verify(router, never()).lastVisit(any());
        verify(deploymentService, never()).republishRoute(any());
        verify(lifecycle, never()).terminate(any(), any());
    }

    @Test
    void aStillActivePreviewGetsItsLostRouteRevivedNormally() {
        Preview current = preview(PreviewStatus.RUNNING, "pod-a", "host-a");
        when(previewRepository.findByStatusIn(ACTIVE)).thenReturn(List.of(current));
        when(previewRepository.findById(PREVIEW_ID)).thenReturn(Optional.of(current));
        when(runnerPool.isAlive("pod-a")).thenReturn(true);
        when(router.lastVisit("host-a")).thenReturn(Optional.of(Instant.now()));
        when(router.refresh("host-a")).thenReturn(false);

        reaper.reap();

        verify(deploymentService).republishRoute(current);
        verify(lifecycle, never()).terminate(any(), any());
    }

    @Test
    void aPreviewWhoseRunnerIsStillAliveAndAlreadyRoutedIsLeftAlone() {
        Preview current = preview(PreviewStatus.RUNNING, "pod-a", "host-a");
        when(previewRepository.findByStatusIn(ACTIVE)).thenReturn(List.of(current));
        when(previewRepository.findById(PREVIEW_ID)).thenReturn(Optional.of(current));
        when(runnerPool.isAlive("pod-a")).thenReturn(true);
        when(router.lastVisit("host-a")).thenReturn(Optional.of(Instant.now()));
        when(router.refresh("host-a")).thenReturn(true);

        reaper.reap();

        verify(deploymentService, never()).republishRoute(any());
        verify(deploymentService, never()).shutDownIfUnused(any(), eq("Nobody has it open"));
    }

    @Test
    void aCrashedDevServerEndsThePreviewOnTheFirstSighting() {
        Preview current = preview(PreviewStatus.RUNNING, "pod-a", "host-a");
        when(previewRepository.findByStatusIn(ACTIVE)).thenReturn(List.of(current));
        when(previewRepository.findById(PREVIEW_ID)).thenReturn(Optional.of(current));
        when(runnerPool.isAlive("pod-a")).thenReturn(true);
        when(bootstrapper.checkHealth("pod-a")).thenReturn(new PreviewBootstrapper.HealthCheck(false, false, true));

        reaper.reap();

        verify(lifecycle).terminate(current, "The dev server stopped unexpectedly");
        verify(router, never()).lastVisit(any());
    }

    @Test
    void anUnresponsiveDevServerIsGivenAFewMissesBeforeItsEnded() {
        Preview current = preview(PreviewStatus.RUNNING, "pod-a", "host-a");
        when(previewRepository.findByStatusIn(ACTIVE)).thenReturn(List.of(current));
        when(previewRepository.findById(PREVIEW_ID)).thenReturn(Optional.of(current));
        when(runnerPool.isAlive("pod-a")).thenReturn(true);
        when(bootstrapper.checkHealth("pod-a")).thenReturn(new PreviewBootstrapper.HealthCheck(true, false, true));
        when(router.lastVisit("host-a")).thenReturn(Optional.empty());

        reaper.reap();
        reaper.reap();
        verify(lifecycle, never()).terminate(any(), any());

        reaper.reap();
        verify(lifecycle).terminate(current, "The dev server stopped responding");
    }

    @Test
    void recoveringBeforeTheLimitResetsTheMissCount() {
        Preview current = preview(PreviewStatus.RUNNING, "pod-a", "host-a");
        when(previewRepository.findByStatusIn(ACTIVE)).thenReturn(List.of(current));
        when(previewRepository.findById(PREVIEW_ID)).thenReturn(Optional.of(current));
        when(runnerPool.isAlive("pod-a")).thenReturn(true);
        when(router.lastVisit("host-a")).thenReturn(Optional.empty());
        when(bootstrapper.checkHealth("pod-a"))
                .thenReturn(new PreviewBootstrapper.HealthCheck(true, false, true))
                .thenReturn(HEALTHY)
                .thenReturn(new PreviewBootstrapper.HealthCheck(true, false, true))
                .thenReturn(new PreviewBootstrapper.HealthCheck(true, false, true));

        reaper.reap();
        reaper.reap();
        reaper.reap();
        reaper.reap();

        verify(lifecycle, never()).terminate(any(), any());
    }

    @Test
    void aDeadFileSyncWatcherIsRelaunchedRatherThanEndingAWorkingPreview() {
        Preview current = preview(PreviewStatus.RUNNING, "pod-a", "host-a");
        when(previewRepository.findByStatusIn(ACTIVE)).thenReturn(List.of(current));
        when(previewRepository.findById(PREVIEW_ID)).thenReturn(Optional.of(current));
        when(runnerPool.isAlive("pod-a")).thenReturn(true);
        when(bootstrapper.checkHealth("pod-a")).thenReturn(new PreviewBootstrapper.HealthCheck(true, true, false));
        when(router.lastVisit("host-a")).thenReturn(Optional.empty());

        reaper.reap();

        verify(bootstrapper).restartWatcher(PROJECT_ID, "pod-a");
        verify(lifecycle, never()).terminate(any(), any());
    }

    @Test
    void startupFailsACreatingRowWhoseHeartbeatIsMissingOrLongStale() {
        Preview neverHeartbeat = Preview.builder().id(1L).projectId(PROJECT_ID).status(PreviewStatus.CREATING).build();
        Preview longStale = Preview.builder().id(2L).projectId(PROJECT_ID).status(PreviewStatus.CREATING)
                .bootstrapOwner("dead-instance").bootstrapHeartbeatAt(Instant.now().minus(Duration.ofMinutes(5))).build();
        when(previewRepository.findByStatusIn(List.of(PreviewStatus.CREATING))).thenReturn(List.of(neverHeartbeat, longStale));

        reaper.failInterruptedStarts();

        verify(lifecycle).fail(eq(neverHeartbeat), any(), eq(null));
        verify(lifecycle).fail(eq(longStale), any(), eq(null));
    }

    @Test
    void startupLeavesACreatingRowAloneWhoseHeartbeatIsStillFresh() {
        Preview stillBeingBootstrapped = Preview.builder().id(3L).projectId(PROJECT_ID).status(PreviewStatus.CREATING)
                .bootstrapOwner("other-live-instance").bootstrapHeartbeatAt(Instant.now().minusSeconds(2)).build();
        when(previewRepository.findByStatusIn(List.of(PreviewStatus.CREATING))).thenReturn(List.of(stillBeingBootstrapped));

        reaper.failInterruptedStarts();

        verify(lifecycle, never()).fail(any(), any(), any());
    }

    @Test
    void aRestartingPreviewIsNotHealthCheckedWhileItsDevServerIsExpectedToBeDown() {
        // The snapshot was RUNNING when reap() fetched it, but a restart flipped it to CREATING in place before
        // this preview's turn in the loop came up - reapIfUnusedOrGone's re-read sees that, not reapIfStuck.
        Preview snapshotTakenBeforeTheRestart = preview(PreviewStatus.RUNNING, "pod-a", "host-a");
        when(previewRepository.findByStatusIn(ACTIVE)).thenReturn(List.of(snapshotTakenBeforeTheRestart));
        when(previewRepository.findById(PREVIEW_ID))
                .thenReturn(Optional.of(preview(PreviewStatus.CREATING, "pod-a", "host-a")));
        when(runnerPool.isAlive("pod-a")).thenReturn(true);
        when(router.lastVisit("host-a")).thenReturn(Optional.empty());

        reaper.reap();

        verify(bootstrapper, never()).checkHealth(any());
        verify(lifecycle, never()).terminate(any(), any());
    }
}
