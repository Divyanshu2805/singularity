package com.singularity.workspace.service.impl;

import com.singularity.workspace.entity.Preview;
import com.singularity.workspace.enums.PreviewStatus;
import com.singularity.workspace.repository.PreviewRepository;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.service.ProjectFilesChanged;
import com.singularity.workspace.service.impl.PreviewRunnerPool.ExecResult;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Covers bringing a running preview level with its project's files.
 *
 * <p>Handles: doing nothing when the runner already stands at the current revision or no preview is running;
 * marking the preview as updating before the copy and as level only after it; leaving the old revision recorded when
 * the copy fails, so the next sweep tries again; restarting through the ordinary restart, and not recording the
 * revision itself, when package.json is no longer the one that was installed; a project that has never had a
 * revision; and a second request that arrives during a pass making it go round once more rather than being lost.
 */
class PreviewSynchronizerTest {

    private static final long PROJECT_ID = 9L;
    private static final long PREVIEW_ID = 1L;
    private static final String POD = "pod-a";

    private final PreviewRepository previewRepository = mock(PreviewRepository.class);
    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final PreviewBootstrapper bootstrapper = mock(PreviewBootstrapper.class);
    private final PreviewDeploymentServiceImpl deploymentService = mock(PreviewDeploymentServiceImpl.class);

    private final PreviewSynchronizer synchronizer =
            new PreviewSynchronizer(previewRepository, projectRepository, bootstrapper, deploymentService);

    private void runningAt(Long syncedRevision, Long currentRevision) {
        when(previewRepository.findFirstByProjectIdAndStatusInOrderByIdDesc(PROJECT_ID, List.of(PreviewStatus.RUNNING)))
                .thenReturn(Optional.of(Preview.builder().id(PREVIEW_ID).projectId(PROJECT_ID).podName(POD)
                        .status(PreviewStatus.RUNNING).syncedRevisionId(syncedRevision).build()));
        when(projectRepository.findCurrentFileRevisionId(PROJECT_ID)).thenReturn(Optional.ofNullable(currentRevision));
        when(previewRepository.markSyncing(PREVIEW_ID, PreviewSynchronizer.APPLYING)).thenReturn(1);
        when(bootstrapper.mirrorOnce(PROJECT_ID, POD)).thenReturn(new ExecResult(0, ""));
    }

    @Test
    void aPreviewAlreadyAtTheCurrentRevisionIsLeftAlone() {
        runningAt(31L, 31L);

        synchronizer.bringUpToDate(PROJECT_ID);

        verifyNoInteractions(bootstrapper);
        verify(previewRepository, never()).markSyncing(anyLong(), any());
    }

    @Test
    void aProjectThatHasNeverHadARevisionIsAlreadyLevel() {
        runningAt(null, null);

        synchronizer.bringUpToDate(PROJECT_ID);

        verifyNoInteractions(bootstrapper);
    }

    @Test
    void aProjectWithNoRunningPreviewNeedsNothing() {
        when(previewRepository.findFirstByProjectIdAndStatusInOrderByIdDesc(PROJECT_ID, List.of(PreviewStatus.RUNNING)))
                .thenReturn(Optional.empty());

        synchronizer.onFilesChanged(new ProjectFilesChanged(PROJECT_ID));

        verifyNoInteractions(bootstrapper, projectRepository);
    }

    @Test
    void aNewerRevisionIsCopiedInAndOnlyThenRecorded() {
        runningAt(31L, 32L);

        synchronizer.bringUpToDate(PROJECT_ID);

        InOrder order = inOrder(previewRepository, bootstrapper);
        order.verify(previewRepository).markSyncing(PREVIEW_ID, PreviewSynchronizer.APPLYING);
        order.verify(bootstrapper).mirrorOnce(PROJECT_ID, POD);
        order.verify(bootstrapper).dependenciesChanged(POD);
        order.verify(previewRepository).markSynced(PREVIEW_ID, 32L);
        verify(deploymentService, never()).restartRunner(anyLong(), anyLong(), any());
    }

    @Test
    void aCopyThatFailsTwiceLeavesTheOldRevisionRecordedForTheNextSweep() {
        runningAt(31L, 32L);
        when(bootstrapper.mirrorOnce(PROJECT_ID, POD)).thenReturn(new ExecResult(1, "mc: <ERROR> connection refused"));

        synchronizer.bringUpToDate(PROJECT_ID);

        verify(bootstrapper, times(2)).mirrorOnce(PROJECT_ID, POD);
        verify(previewRepository, never()).markSynced(anyLong(), any());
        verify(bootstrapper, never()).dependenciesChanged(any());
    }

    @Test
    void aCopyThatFailsOnceIsTriedAgainOnTheSpot() {
        runningAt(31L, 32L);
        when(bootstrapper.mirrorOnce(PROJECT_ID, POD))
                .thenReturn(new ExecResult(124, ""))
                .thenReturn(new ExecResult(0, ""));

        synchronizer.bringUpToDate(PROJECT_ID);

        verify(previewRepository).markSynced(PREVIEW_ID, 32L);
    }

    @Test
    void aChangedPackageJsonGoesThroughTheOrdinaryRestartWhichRecordsTheRevisionItself() {
        runningAt(31L, 32L);
        when(bootstrapper.dependenciesChanged(POD)).thenReturn(true);

        synchronizer.bringUpToDate(PROJECT_ID);

        verify(deploymentService).restartRunner(PROJECT_ID, PREVIEW_ID, PreviewSynchronizer.INSTALLING);
        verify(previewRepository, never()).markSynced(anyLong(), any());
    }

    @Test
    void aPreviewThatStoppedBeforeTheCopyIsNotTouched() {
        runningAt(31L, 32L);
        when(previewRepository.markSyncing(PREVIEW_ID, PreviewSynchronizer.APPLYING)).thenReturn(0);

        synchronizer.bringUpToDate(PROJECT_ID);

        verifyNoInteractions(bootstrapper);
    }

    @Test
    void aRequestThatArrivesDuringAPassMakesItGoRoundOnceMore() {
        runningAt(31L, 32L);
        AtomicInteger copies = new AtomicInteger();
        when(bootstrapper.mirrorOnce(PROJECT_ID, POD)).thenAnswer(call -> {
            if (copies.incrementAndGet() == 1) synchronizer.bringUpToDate(PROJECT_ID);
            return new ExecResult(0, "");
        });

        synchronizer.bringUpToDate(PROJECT_ID);

        verify(bootstrapper, times(2)).mirrorOnce(PROJECT_ID, POD);
    }

    @Test
    void aFailureInOnePassDoesNotLeaveTheProjectMarkedAsInProgressForEver() {
        runningAt(31L, 32L);
        when(bootstrapper.mirrorOnce(PROJECT_ID, POD))
                .thenThrow(new IllegalStateException("cluster went away"))
                .thenReturn(new ExecResult(0, ""));

        synchronizer.bringUpToDate(PROJECT_ID);
        synchronizer.bringUpToDate(PROJECT_ID);

        verify(previewRepository).markSynced(PREVIEW_ID, 32L);
    }
}
