package com.singularity.workspace.service.impl;

import com.singularity.common.error.ExternalServiceException;
import com.singularity.workspace.config.InstanceId;
import com.singularity.workspace.config.PreviewProperties;
import com.singularity.workspace.entity.Preview;
import com.singularity.workspace.enums.PreviewFailureKind;
import com.singularity.workspace.enums.PreviewStatus;
import com.singularity.workspace.repository.PreviewRepository;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.service.ProjectFilesChanged;
import com.singularity.workspace.service.impl.PreviewRunnerPool.ExecResult;
import io.fabric8.kubernetes.api.model.Pod;
import io.fabric8.kubernetes.api.model.PodBuilder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Duration;
import java.util.Optional;

import static com.singularity.workspace.service.impl.PreviewRunnerPool.RUNNER_CONTAINER;
import static com.singularity.workspace.service.impl.PreviewRunnerPool.SYNCER_CONTAINER;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Covers CODE_REVIEW.md PRE-03 (the bootstrap heartbeat) and PRE-06 (checking the dev server and file-sync watcher's
 * actual process health, which a pod's phase alone cannot answer), and that a start whose dev server is already
 * answering survives the router being unreachable for a moment.
 *
 * <p>Also covers the line for a runner - a waiter takes the first pod that comes free, never ahead of someone who
 * was waiting first, hands the pod back if it was stopped while claiming, and fails as a capacity failure when the
 * line's limit passes - and what a whole start records: the revision it copied, read before the copy; the notice
 * that makes the synchronizer look once it is up; a failed install as one plain sentence with its cause; and that a
 * copy is one command that stops the watcher, copies under a time limit of its own, and starts the watcher again -
 * never a second writer beside the first.
 *
 * <p>The runner is scripted by what each command contains rather than by call order, since a start runs the same
 * probe a varying number of times.
 */
class PreviewBootstrapperTest {

    private static final long PREVIEW_ID = 1L;
    private static final long PROJECT_ID = 9L;
    private static final long REVISION = 31L;
    private static final String POD_NAME = "pod-a";

    private final PreviewRepository previewRepository = mock(PreviewRepository.class);
    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final PreviewRunnerPool runnerPool = mock(PreviewRunnerPool.class);
    private final PreviewRouter router = mock(PreviewRouter.class);
    private final PreviewLifecycle lifecycle = mock(PreviewLifecycle.class);
    private final PreviewProperties properties = new PreviewProperties(
            "singularity-ai", "http", "localhost", null, 5173, "local", "projects",
            Duration.ofMinutes(30), Duration.ofMinutes(2), Duration.ofMinutes(5), "secret", Duration.ofHours(6),
            Duration.ofMinutes(5));
    private final InstanceId instanceId = mock(InstanceId.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);

    private final PreviewBootstrapper bootstrapper = new PreviewBootstrapper(
            previewRepository, projectRepository, runnerPool, router, lifecycle, properties, instanceId, events);

    private String probe = "0||up";
    private String logs = "";

    @BeforeEach
    void runWithoutPauses() {
        bootstrapper.pollInterval = Duration.ZERO;
        when(instanceId.value()).thenReturn("inst-1");
    }

    private Preview creating(String podName) {
        Preview preview = Preview.builder().id(PREVIEW_ID).status(PreviewStatus.CREATING).podName(podName)
                .hostname("p9-abc.localhost").build();
        when(previewRepository.findById(PREVIEW_ID)).thenReturn(Optional.of(preview));
        when(previewRepository.heartbeatBootstrap(eq(PREVIEW_ID), any(), any())).thenReturn(1);
        when(previewRepository.updatePhase(eq(PREVIEW_ID), any())).thenReturn(1);
        return preview;
    }

    private void scriptTheRunner() {
        when(projectRepository.findCurrentFileRevisionId(PROJECT_ID)).thenReturn(Optional.of(REVISION));
        when(runnerPool.exec(eq(POD_NAME), eq(SYNCER_CONTAINER), any(), any())).thenReturn(new ExecResult(0, "started"));
        when(runnerPool.exec(eq(POD_NAME), eq(RUNNER_CONTAINER), any(), any())).thenAnswer(call -> {
            String script = call.getArgument(3);
            if (script.contains("wget")) return new ExecResult(0, probe);
            if (script.contains("tail -n")) return new ExecResult(0, logs);
            return new ExecResult(0, "started");
        });
        when(runnerPool.podIp(POD_NAME)).thenReturn(Optional.of("10.0.0.7"));
        when(previewRepository.markRunning(eq(PREVIEW_ID), any(), any())).thenReturn(1);
    }

    private static Pod pod(String name) {
        return new PodBuilder().withNewMetadata().withName(name).endMetadata().build();
    }

    @Test
    void claimingABootstrapWritesTheHeartbeatBeforeDoingAnyWork() {
        Preview preview = Preview.builder().id(PREVIEW_ID).status(PreviewStatus.CREATING).podName(POD_NAME).build();
        when(previewRepository.findById(PREVIEW_ID)).thenReturn(Optional.of(preview));
        // 0 rows updated short-circuits start() right after the heartbeat write, before any exec call - a fast,
        // deterministic way to observe the claim without also running the polling loop.
        when(previewRepository.updatePhase(eq(PREVIEW_ID), any())).thenReturn(0);

        bootstrapper.start(PREVIEW_ID, PROJECT_ID);

        verify(previewRepository).heartbeatBootstrap(eq(PREVIEW_ID), eq("inst-1"), any());
        verifyNoInteractions(runnerPool);
    }

    @Test
    void aBootstrapForAPreviewThatIsNoLongerCreatingIsNotClaimed() {
        Preview preview = Preview.builder().id(PREVIEW_ID).status(PreviewStatus.TERMINATED).podName(POD_NAME).build();
        when(previewRepository.findById(PREVIEW_ID)).thenReturn(Optional.of(preview));

        bootstrapper.start(PREVIEW_ID, PROJECT_ID);

        verify(previewRepository, never()).heartbeatBootstrap(any(), any(), any());
    }

    @Test
    void aStartRecordsTheRevisionItCopiedAndAsksForALookOnceItIsUp() {
        creating(POD_NAME);
        scriptTheRunner();

        bootstrapper.start(PREVIEW_ID, PROJECT_ID);

        verify(router).register("p9-abc.localhost", "10.0.0.7");
        verify(previewRepository).markRunning(eq(PREVIEW_ID), any(), eq(REVISION));
        verify(events).publishEvent(new ProjectFilesChanged(PROJECT_ID));
        verify(runnerPool, times(1)).exec(eq(POD_NAME), eq(SYNCER_CONTAINER), any(), contains("mc mirror"));
    }

    @Test
    void aCopyStopsTheWatcherCopiesUnderItsOwnTimeLimitAndStartsTheWatcherAgain() {
        when(runnerPool.exec(eq(POD_NAME), eq(SYNCER_CONTAINER), any(), any())).thenReturn(new ExecResult(0, ""));

        bootstrapper.mirrorOnce(PROJECT_ID, POD_NAME);

        org.mockito.ArgumentCaptor<String> script = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(runnerPool).exec(eq(POD_NAME), eq(SYNCER_CONTAINER), any(), script.capture());
        String ran = script.getValue();
        int stop = ran.indexOf("kill \"$pid\"");
        int copy = ran.indexOf("timeout -k 5 45 mc mirror --overwrite --remove --quiet --exclude 'node_modules/*' local/projects/9/ /app/");
        int watch = ran.indexOf("--watch local/projects/9/ /app/");
        assertThat(stop).isPositive();
        assertThat(copy).isGreaterThan(stop);
        assertThat(watch).isGreaterThan(copy);
        assertThat(ran).contains("[ \"$pid\" = \"$self\" ] && continue").endsWith("exit $code\n");
    }

    @Test
    void theBootScriptLeavesTheChecksumOfThePackageJsonItInstalled() {
        creating(POD_NAME);
        scriptTheRunner();

        bootstrapper.start(PREVIEW_ID, PROJECT_ID);

        verify(runnerPool).exec(eq(POD_NAME), eq(RUNNER_CONTAINER), any(), contains("> /tmp/installed.pkg"));
    }

    @Test
    void aFailedInstallIsRecordedAsOnePlainSentenceWithItsCauseAndTheOutput() {
        Preview preview = creating(POD_NAME);
        scriptTheRunner();
        probe = "1||down";
        logs = "$ npm install\nnpm error code E404\nnpm error 404  'not-a-real-package@^1.0.0' is not in this registry.\n";

        bootstrapper.start(PREVIEW_ID, PROJECT_ID);

        verify(lifecycle).fail(preview, PreviewFailureKind.INSTALL,
                "The package \"not-a-real-package\" doesn't exist on npm - check its name in package.json.", logs);
        verify(previewRepository, never()).markRunning(any(), any(), any());
        verify(events, never()).publishEvent(any());
    }

    @Test
    void aDevServerThatExitsWhileStartingIsRecordedAsTheDevServers() {
        Preview preview = creating(POD_NAME);
        scriptTheRunner();
        probe = "0|1|down";
        logs = "$ npm install\n\n$ npm run dev\nfailed to load config from /app/vite.config.ts\n";

        bootstrapper.start(PREVIEW_ID, PROJECT_ID);

        verify(lifecycle).fail(preview, PreviewFailureKind.DEV_SERVER,
                "vite.config.ts has an error, so the dev server couldn't start.", logs);
    }

    @Test
    void aStartThatLosesItsRowToStopTakesTheRouteBackDownAndAsksForNothing() {
        creating(POD_NAME);
        scriptTheRunner();
        when(previewRepository.markRunning(eq(PREVIEW_ID), any(), any())).thenReturn(0);

        bootstrapper.start(PREVIEW_ID, PROJECT_ID);

        verify(router).remove("p9-abc.localhost");
        verify(events, never()).publishEvent(any());
    }

    @Test
    void aWaiterTakesTheFirstRunnerThatComesFree() {
        Preview preview = creating(null);
        when(previewRepository.countWaitingAhead(eq(PREVIEW_ID), any())).thenReturn(0);
        when(runnerPool.claim(PROJECT_ID)).thenReturn(Optional.empty(), Optional.empty(), Optional.of(pod(POD_NAME)));
        when(previewRepository.assignPod(eq(PREVIEW_ID), eq(POD_NAME), any(), any())).thenReturn(1);

        String claimed = bootstrapper.waitForRunner(preview, PROJECT_ID);

        assertThat(claimed).isEqualTo(POD_NAME);
        verify(runnerPool, times(3)).claim(PROJECT_ID);
        verify(previewRepository, times(3)).heartbeatBootstrap(eq(PREVIEW_ID), eq("inst-1"), any());
        verify(lifecycle, never()).fail(any(), any(), any(), any());
    }

    @Test
    void aWaiterDoesNotClaimWhileSomeoneWhoWasWaitingFirstIsStillAhead() {
        Preview preview = creating(null);
        when(previewRepository.countWaitingAhead(eq(PREVIEW_ID), any())).thenReturn(1, 1, 0);
        when(runnerPool.claim(PROJECT_ID)).thenReturn(Optional.of(pod(POD_NAME)));
        when(previewRepository.assignPod(eq(PREVIEW_ID), eq(POD_NAME), any(), any())).thenReturn(1);

        bootstrapper.waitForRunner(preview, PROJECT_ID);

        verify(runnerPool, times(1)).claim(PROJECT_ID);
    }

    @Test
    void aWaiterStoppedWhileItWasClaimingHandsThePodStraightBack() {
        Preview preview = creating(null);
        when(runnerPool.claim(PROJECT_ID)).thenReturn(Optional.of(pod(POD_NAME)));
        when(previewRepository.assignPod(eq(PREVIEW_ID), eq(POD_NAME), any(), any())).thenReturn(0);

        String claimed = bootstrapper.waitForRunner(preview, PROJECT_ID);

        assertThat(claimed).isNull();
        verify(runnerPool).release(POD_NAME);
    }

    @Test
    void aWaiterWhoseRowIsNoLongerStartingLeavesTheLineWithoutClaiming() {
        Preview preview = creating(null);
        when(previewRepository.heartbeatBootstrap(eq(PREVIEW_ID), any(), any())).thenReturn(0);

        assertThat(bootstrapper.waitForRunner(preview, PROJECT_ID)).isNull();

        verify(runnerPool, never()).claim(anyLong());
    }

    @Test
    void aLineThatNeverMovesFailsAsNoRunnerComingFree() {
        PreviewBootstrapper impatient = new PreviewBootstrapper(previewRepository, projectRepository, runnerPool, router,
                lifecycle, new PreviewProperties("singularity-ai", "http", "localhost", null, 5173, "local", "projects",
                Duration.ofMinutes(30), Duration.ofMinutes(2), Duration.ofMinutes(5), "secret", Duration.ofHours(6),
                Duration.ofMillis(-1)), instanceId, events);
        impatient.pollInterval = Duration.ZERO;
        Preview preview = creating(null);
        when(runnerPool.claim(PROJECT_ID)).thenReturn(Optional.empty());

        assertThat(impatient.waitForRunner(preview, PROJECT_ID)).isNull();

        verify(lifecycle).fail(eq(preview), eq(PreviewFailureKind.CAPACITY), contains("stayed busy"), eq(null));
    }

    @Test
    void aStartThatWaitedInLineGoesOnToBootInThePodItWasGiven() {
        creating(null);
        scriptTheRunner();
        when(runnerPool.claim(PROJECT_ID)).thenReturn(Optional.empty(), Optional.of(pod(POD_NAME)));
        when(previewRepository.assignPod(eq(PREVIEW_ID), eq(POD_NAME), any(), any())).thenReturn(1);

        bootstrapper.start(PREVIEW_ID, PROJECT_ID);

        verify(runnerPool).exec(eq(POD_NAME), eq(RUNNER_CONTAINER), any(), contains("npm install"));
        verify(previewRepository).markRunning(eq(PREVIEW_ID), any(), eq(REVISION));
    }

    @Test
    void aRouterThatIsUnreachableForAMomentDoesNotThrowAwayAPreviewThatIsAlreadyServing() {
        Preview preview = Preview.builder().id(PREVIEW_ID).status(PreviewStatus.CREATING).podName(POD_NAME)
                .hostname("p9-abc.localhost").build();
        doThrow(new ExternalServiceException("Couldn't reach the preview router (Redis)", null))
                .doThrow(new ExternalServiceException("Couldn't reach the preview router (Redis)", null))
                .doNothing()
                .when(router).register("p9-abc.localhost", "10.0.0.7");

        bootstrapper.publishRoute(preview, "10.0.0.7", Duration.ZERO);

        verify(router, times(3)).register("p9-abc.localhost", "10.0.0.7");
    }

    @Test
    void aRouterThatStaysUnreachableStillFailsTheStartRatherThanWaitingForever() {
        Preview preview = Preview.builder().id(PREVIEW_ID).status(PreviewStatus.CREATING).podName(POD_NAME)
                .hostname("p9-abc.localhost").build();
        doThrow(new ExternalServiceException("Couldn't reach the preview router (Redis)", null))
                .when(router).register(any(), any());

        assertThatThrownBy(() -> bootstrapper.publishRoute(preview, "10.0.0.7", Duration.ZERO))
                .isInstanceOf(ExternalServiceException.class);

        verify(router, times(15)).register(any(), any());
    }

    @Test
    void aChangedPackageJsonIsToldFromOneThatIsTheSameOrWasNeverRecorded() {
        when(runnerPool.exec(eq(POD_NAME), eq(RUNNER_CONTAINER), any(), contains("/tmp/installed.pkg")))
                .thenReturn(new ExecResult(0, "changed\n"), new ExecResult(0, "same\n"), new ExecResult(-1, "(timed out after 30s)"));

        assertThat(bootstrapper.dependenciesChanged(POD_NAME)).isTrue();
        assertThat(bootstrapper.dependenciesChanged(POD_NAME)).isFalse();
        assertThat(bootstrapper.dependenciesChanged(POD_NAME)).isFalse();
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

        verify(runnerPool).exec(eq(POD_NAME), eq(SYNCER_CONTAINER), any(), contains("--watch"));
    }
}
