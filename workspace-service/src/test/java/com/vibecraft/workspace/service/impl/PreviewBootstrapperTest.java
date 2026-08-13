package com.vibecraft.workspace.service.impl;

import com.vibecraft.workspace.config.InstanceId;
import com.vibecraft.workspace.config.PreviewProperties;
import com.vibecraft.workspace.entity.Preview;
import com.vibecraft.workspace.enums.PreviewStatus;
import com.vibecraft.workspace.repository.PreviewRepository;
import com.vibecraft.workspace.service.impl.PreviewRunnerPool.ExecResult;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.Optional;

import static com.vibecraft.workspace.service.impl.PreviewRunnerPool.RUNNER_CONTAINER;
import static com.vibecraft.workspace.service.impl.PreviewRunnerPool.SYNCER_CONTAINER;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Covers CODE_REVIEW.md PRE-03 (the bootstrap heartbeat) and PRE-06 (checking the dev server and file-sync watcher's
 * actual process health, which a pod's phase alone cannot answer).
 */
class PreviewBootstrapperTest {

    private static final long PREVIEW_ID = 1L;
    private static final long PROJECT_ID = 9L;
    private static final String POD_NAME = "pod-a";

    private final PreviewRepository previewRepository = mock(PreviewRepository.class);
    private final PreviewRunnerPool runnerPool = mock(PreviewRunnerPool.class);
    private final PreviewRouter router = mock(PreviewRouter.class);
    private final PreviewLifecycle lifecycle = mock(PreviewLifecycle.class);
    private final PreviewProperties properties = new PreviewProperties(
            "vibecraft-ai", "http", "localhost", null, 5173, "local", "projects",
            Duration.ofMinutes(30), Duration.ofMinutes(2), Duration.ofMinutes(5), "secret", Duration.ofHours(6));
    private final InstanceId instanceId = mock(InstanceId.class);

    private final PreviewBootstrapper bootstrapper = new PreviewBootstrapper(
            previewRepository, runnerPool, router, lifecycle, properties, instanceId);

    @Test
    void claimingABootstrapWritesTheHeartbeatBeforeDoingAnyWork() {
        Preview preview = Preview.builder().id(PREVIEW_ID).status(PreviewStatus.CREATING).podName(POD_NAME).build();
        when(previewRepository.findById(PREVIEW_ID)).thenReturn(Optional.of(preview));
        when(instanceId.value()).thenReturn("inst-1");
        // 0 rows updated short-circuits start() right after the heartbeat write, before any exec call - a fast,
        // deterministic way to observe the claim without also running the (real Thread.sleep) polling loop.
        when(previewRepository.updatePhase(eq(PREVIEW_ID), any())).thenReturn(0);

        bootstrapper.start(PREVIEW_ID, PROJECT_ID, false);

        verify(previewRepository).heartbeatBootstrap(eq(PREVIEW_ID), eq("inst-1"), any());
        verifyNoInteractions(runnerPool);
    }

    @Test
    void aBootstrapForAPreviewThatIsNoLongerCreatingIsNotClaimed() {
        Preview preview = Preview.builder().id(PREVIEW_ID).status(PreviewStatus.TERMINATED).podName(POD_NAME).build();
        when(previewRepository.findById(PREVIEW_ID)).thenReturn(Optional.of(preview));

        bootstrapper.start(PREVIEW_ID, PROJECT_ID, false);

        verify(previewRepository, org.mockito.Mockito.never()).heartbeatBootstrap(any(), any(), any());
    }

    @Test
    void checkHealthReportsTheDevServerDeadOnceItsProcessHasActuallyExited() {
        when(runnerPool.exec(eq(POD_NAME), eq(RUNNER_CONTAINER), any(), any()))
                .thenReturn(new ExecResult(0, "0|1|down"));
        when(runnerPool.exec(eq(POD_NAME), eq(SYNCER_CONTAINER), any(), any()))
                .thenReturn(new ExecResult(0, ""));

        PreviewBootstrapper.HealthCheck health = bootstrapper.checkHealth(POD_NAME);

        assertThat(health.devServerAlive()).isFalse();
    }

    @Test
    void checkHealthReportsAStillRunningButUnresponsiveDevServerSeparatelyFromAnExitedOne() {
        when(runnerPool.exec(eq(POD_NAME), eq(RUNNER_CONTAINER), any(), any()))
                .thenReturn(new ExecResult(0, "0||down"));
        when(runnerPool.exec(eq(POD_NAME), eq(SYNCER_CONTAINER), any(), any()))
                .thenReturn(new ExecResult(0, ""));

        PreviewBootstrapper.HealthCheck health = bootstrapper.checkHealth(POD_NAME);

        assertThat(health.devServerAlive()).isTrue();
        assertThat(health.serving()).isFalse();
    }

    @Test
    void checkHealthReportsTheWatcherGoneWhenNoMirrorProcessIsFound() {
        when(runnerPool.exec(eq(POD_NAME), eq(RUNNER_CONTAINER), any(), any()))
                .thenReturn(new ExecResult(0, "0||up"));
        when(runnerPool.exec(eq(POD_NAME), eq(SYNCER_CONTAINER), any(), any()))
                .thenReturn(new ExecResult(1, ""));

        PreviewBootstrapper.HealthCheck health = bootstrapper.checkHealth(POD_NAME);

        assertThat(health.watcherAlive()).isFalse();
        assertThat(health.devServerAlive()).isTrue();
        assertThat(health.serving()).isTrue();
    }

    @Test
    void restartWatcherRelaunchesItInTheSyncerContainer() {
        when(runnerPool.exec(eq(POD_NAME), eq(SYNCER_CONTAINER), any(), any()))
                .thenReturn(new ExecResult(0, "started"));

        assertThat(bootstrapper.restartWatcher(PROJECT_ID, POD_NAME)).isTrue();

        verify(runnerPool).exec(eq(POD_NAME), eq(SYNCER_CONTAINER), any(), org.mockito.ArgumentMatchers.contains("--watch"));
    }
}
