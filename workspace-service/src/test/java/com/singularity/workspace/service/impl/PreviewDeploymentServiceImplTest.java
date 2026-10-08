package com.singularity.workspace.service.impl;

import com.singularity.common.dto.PlanDto;
import com.singularity.common.error.ExternalServiceException;
import com.singularity.common.feign.AccountServiceClient;
import com.singularity.common.security.AuthUtil;
import com.singularity.workspace.config.PreviewProperties;
import com.singularity.workspace.dto.deploy.PreviewLogsResponse;
import com.singularity.workspace.dto.deploy.PreviewResponse;
import com.singularity.workspace.entity.Preview;
import com.singularity.workspace.entity.PreviewSession;
import com.singularity.workspace.entity.Project;
import com.singularity.workspace.enums.PreviewFailureKind;
import com.singularity.workspace.enums.PreviewStatus;
import com.singularity.workspace.enums.PreviewSyncState;
import com.singularity.workspace.repository.PreviewRepository;
import com.singularity.workspace.repository.PreviewSessionRepository;
import com.singularity.workspace.repository.ProjectRepository;
import io.fabric8.kubernetes.api.model.PodBuilder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers what a preview's entry point decides beyond the plan allowance, which has its own race test.
 *
 * <p>Handles: a start with no idle runner joining the line instead of failing, and saying where it stands; a start
 * that arrives while others are waiting going to the back without trying for a pod; a waiting preview having no pod
 * to check and nothing to read; a running preview whose pod has gone being ended the moment its owner asks, but not
 * when the cluster merely fails to answer; whether a running preview is level with the project's files; a failure's
 * kind reaching the person whose start it was; and a restart by the service itself leaving a preview that is no
 * longer running alone.
 */
class PreviewDeploymentServiceImplTest {

    private static final long USER_ID = 42L;
    private static final long PROJECT_ID = 7L;
    private static final long PREVIEW_ID = 70L;
    private static final long SESSION_ID = 700L;

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
            "singularity-ai", "http", "localhost", null, 5173, "myminio", "projects",
            Duration.ofMinutes(10), Duration.ofMinutes(2), Duration.ofSeconds(90),
            "test-secret-at-least-32-bytes-long-000000", Duration.ofHours(6), Duration.ofMinutes(5));

    private final PreviewDeploymentServiceImpl service = new PreviewDeploymentServiceImpl(
            previewRepository, sessionRepository, projectRepository, runnerPool, router, bootstrapper, lifecycle,
            properties, accountServiceClient, authUtil);

    @BeforeEach
    void signedInWithRoomOnThePlan() {
        when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
        when(accountServiceClient.getPlanLimits(USER_ID)).thenReturn(new PlanDto(1L, "Free", 1, 10_000, 1, false));
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(Project.builder().id(PROJECT_ID).build()));
        when(previewRepository.findFirstByProjectIdAndStatusInOrderByIdDesc(eq(PROJECT_ID), any())).thenReturn(Optional.empty());
        when(sessionRepository.findFirstByProjectIdAndUserIdAndEndedAtIsNullOrderByIdDesc(PROJECT_ID, USER_ID)).thenReturn(Optional.empty());
        when(previewRepository.findLatestHostname(PROJECT_ID)).thenReturn(Optional.of("p7-abc.localhost"));
        when(previewRepository.save(any())).thenAnswer(call -> {
            Preview preview = call.getArgument(0);
            preview.setId(PREVIEW_ID);
            return preview;
        });
        when(sessionRepository.save(any())).thenAnswer(call -> {
            PreviewSession session = call.getArgument(0);
            session.setId(SESSION_ID);
            return session;
        });
    }

    private Preview runner(PreviewStatus status, String podName) {
        return Preview.builder().id(PREVIEW_ID).projectId(PROJECT_ID).status(status).podName(podName)
                .hostname("p7-abc.localhost").previewUrl("http://p7-abc.localhost/").build();
    }

    private PreviewSession openSession(Preview runner) {
        PreviewSession session = PreviewSession.builder().id(SESSION_ID).preview(runner).projectId(PROJECT_ID)
                .userId(USER_ID).lastSeenAt(Instant.now()).failed(false).build();
        when(sessionRepository.findFirstByProjectIdAndUserIdOrderByIdDesc(PROJECT_ID, USER_ID)).thenReturn(Optional.of(session));
        return session;
    }

    @Test
    void aStartWithNoIdleRunnerJoinsTheLineInsteadOfFailing() {
        when(runnerPool.claim(PROJECT_ID)).thenReturn(Optional.empty());
        when(previewRepository.countWaitingAhead(eq(PREVIEW_ID), any())).thenReturn(2);

        PreviewResponse response = service.startPreview(PROJECT_ID);

        ArgumentCaptor<Preview> saved = ArgumentCaptor.forClass(Preview.class);
        verify(previewRepository).save(saved.capture());
        assertThat(saved.getValue().getPodName()).isNull();
        assertThat(saved.getValue().getDetail()).isEqualTo("Waiting for a free runner");
        assertThat(saved.getValue().getBootstrapHeartbeatAt()).isNotNull();
        assertThat(response.status()).isEqualTo(PreviewStatus.CREATING);
        assertThat(response.queuePosition()).isEqualTo(3);
        verify(bootstrapper).start(PREVIEW_ID, PROJECT_ID);
    }

    @Test
    void aStartThatGetsARunnerAtOnceIsNotInTheLine() {
        when(runnerPool.claim(PROJECT_ID)).thenReturn(Optional.of(
                new PodBuilder().withNewMetadata().withName("runner-a").endMetadata().build()));

        PreviewResponse response = service.startPreview(PROJECT_ID);

        ArgumentCaptor<Preview> saved = ArgumentCaptor.forClass(Preview.class);
        verify(previewRepository).save(saved.capture());
        assertThat(saved.getValue().getPodName()).isEqualTo("runner-a");
        assertThat(saved.getValue().getDetail()).isEqualTo("Starting a runner");
        assertThat(response.queuePosition()).isNull();
    }

    @Test
    void aStartThatArrivesWhileOthersAreWaitingGoesToTheBackWithoutTryingForAPod() {
        when(previewRepository.countWaitingAhead(eq(Long.MAX_VALUE), any())).thenReturn(1);

        service.startPreview(PROJECT_ID);

        verify(runnerPool, never()).claim(anyLong());
        ArgumentCaptor<Preview> saved = ArgumentCaptor.forClass(Preview.class);
        verify(previewRepository).save(saved.capture());
        assertThat(saved.getValue().getPodName()).isNull();
    }

    @Test
    void aWaitingPreviewHasNoPodToFindDeadAndIsJoinedAsItIs() {
        Preview waiting = runner(PreviewStatus.CREATING, null);
        when(previewRepository.findFirstByProjectIdAndStatusInOrderByIdDesc(eq(PROJECT_ID), any())).thenReturn(Optional.of(waiting));

        PreviewResponse response = service.startPreview(PROJECT_ID);

        verify(runnerPool, never()).isAlive(any());
        verify(lifecycle, never()).terminate(any(), any());
        verify(previewRepository, never()).save(any());
        assertThat(response.queuePosition()).isEqualTo(1);
    }

    @Test
    void theOutputOfAWaitingPreviewSaysItIsWaiting() {
        openSession(runner(PreviewStatus.CREATING, null));

        PreviewLogsResponse logs = service.getPreviewLogs(PROJECT_ID);

        assertThat(logs.log()).startsWith("Waiting for a free runner");
        verify(bootstrapper, never()).readLogs(any());
    }

    @Test
    void aRunningPreviewWhosePodHasGoneIsEndedTheMomentItsOwnerAsks() {
        Preview running = runner(PreviewStatus.RUNNING, "runner-a");
        PreviewSession session = openSession(running);
        when(runnerPool.isAlive("runner-a")).thenReturn(false);
        PreviewSession ended = PreviewSession.builder().id(SESSION_ID).preview(runner(PreviewStatus.TERMINATED, "runner-a"))
                .projectId(PROJECT_ID).userId(USER_ID).endedAt(Instant.now())
                .endReason(PreviewDeploymentServiceImpl.RUNNER_GONE).failed(false).build();
        when(sessionRepository.findById(session.getId())).thenReturn(Optional.of(ended));

        PreviewResponse response = service.getPreview(PROJECT_ID).orElseThrow();

        verify(lifecycle).terminate(running, PreviewDeploymentServiceImpl.RUNNER_GONE);
        assertThat(response.status()).isEqualTo(PreviewStatus.TERMINATED);
        assertThat(response.detail()).isEqualTo(PreviewDeploymentServiceImpl.RUNNER_GONE);
    }

    @Test
    void aClusterThatDoesNotAnswerIsNotEvidenceThePodHasGone() {
        openSession(runner(PreviewStatus.RUNNING, "runner-a"));
        when(runnerPool.isAlive("runner-a")).thenThrow(new ExternalServiceException("Couldn't reach the preview cluster", null));

        PreviewResponse response = service.getPreview(PROJECT_ID).orElseThrow();

        verify(lifecycle, never()).terminate(any(), any());
        assertThat(response.status()).isEqualTo(PreviewStatus.RUNNING);
    }

    @Test
    void aRunningPreviewAtTheProjectsCurrentRevisionIsUpToDate() {
        Preview running = runner(PreviewStatus.RUNNING, "runner-a");
        running.setSyncedRevisionId(31L);
        openSession(running);
        when(runnerPool.isAlive("runner-a")).thenReturn(true);
        when(projectRepository.findCurrentFileRevisionId(PROJECT_ID)).thenReturn(Optional.of(31L));

        PreviewResponse response = service.getPreview(PROJECT_ID).orElseThrow();

        assertThat(response.syncState()).isEqualTo(PreviewSyncState.UP_TO_DATE);
        assertThat(response.syncDetail()).isNull();
    }

    @Test
    void aRunningPreviewBehindTheProjectsCurrentRevisionIsUpdating() {
        Preview running = runner(PreviewStatus.RUNNING, "runner-a");
        running.setSyncedRevisionId(31L);
        openSession(running);
        when(runnerPool.isAlive("runner-a")).thenReturn(true);
        when(projectRepository.findCurrentFileRevisionId(PROJECT_ID)).thenReturn(Optional.of(32L));

        PreviewResponse response = service.getPreview(PROJECT_ID).orElseThrow();

        assertThat(response.syncState()).isEqualTo(PreviewSyncState.UPDATING);
        assertThat(response.syncDetail()).isEqualTo("Applying your changes");
    }

    @Test
    void aProjectThatHasNeverHadARevisionIsUpToDate() {
        openSession(runner(PreviewStatus.RUNNING, "runner-a"));
        when(runnerPool.isAlive("runner-a")).thenReturn(true);
        when(projectRepository.findCurrentFileRevisionId(PROJECT_ID)).thenReturn(Optional.empty());

        assertThat(service.getPreview(PROJECT_ID).orElseThrow().syncState()).isEqualTo(PreviewSyncState.UP_TO_DATE);
    }

    @Test
    void aStartingPreviewHasNoSyncStateAtAll() {
        openSession(runner(PreviewStatus.CREATING, "runner-a"));

        PreviewResponse response = service.getPreview(PROJECT_ID).orElseThrow();

        assertThat(response.syncState()).isNull();
        verify(projectRepository, never()).findCurrentFileRevisionId(anyLong());
    }

    @Test
    void aFailedStartCarriesItsKindToThePersonWhoseStartItWas() {
        Preview failed = runner(PreviewStatus.FAILED, null);
        failed.setFailureKind(PreviewFailureKind.INSTALL);
        PreviewSession session = PreviewSession.builder().id(SESSION_ID).preview(failed).projectId(PROJECT_ID)
                .userId(USER_ID).endedAt(Instant.now()).endReason("npm install failed - check package.json.").failed(true).build();
        when(sessionRepository.findFirstByProjectIdAndUserIdOrderByIdDesc(PROJECT_ID, USER_ID)).thenReturn(Optional.of(session));

        PreviewResponse response = service.getPreview(PROJECT_ID).orElseThrow();

        assertThat(response.status()).isEqualTo(PreviewStatus.FAILED);
        assertThat(response.failureKind()).isEqualTo(PreviewFailureKind.INSTALL);
    }

    @Test
    void theServicesOwnRestartBouncesARunningPreviewOnTheSamePod() {
        Preview running = runner(PreviewStatus.RUNNING, "runner-a");
        when(previewRepository.findById(PREVIEW_ID)).thenReturn(Optional.of(running));
        when(previewRepository.markRestarting(eq(PREVIEW_ID), eq("Installing new packages"), any())).thenReturn(1);

        service.restartRunner(PROJECT_ID, PREVIEW_ID, "Installing new packages");

        verify(router).remove("p7-abc.localhost");
        verify(bootstrapper).stopDevServer("runner-a");
        verify(bootstrapper).start(PREVIEW_ID, PROJECT_ID);
    }

    @Test
    void theServicesOwnRestartLeavesAPreviewThatIsNoLongerRunningAlone() {
        when(previewRepository.findById(PREVIEW_ID)).thenReturn(Optional.of(runner(PreviewStatus.TERMINATED, "runner-a")));

        service.restartRunner(PROJECT_ID, PREVIEW_ID, "Installing new packages");

        verify(previewRepository, never()).markRestarting(anyLong(), any(), any());
        verify(bootstrapper, never()).start(anyLong(), anyLong());
    }
}
