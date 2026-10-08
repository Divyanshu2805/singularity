package com.singularity.workspace.service.impl;

import com.singularity.workspace.entity.Preview;
import com.singularity.workspace.enums.PreviewStatus;
import com.singularity.workspace.repository.PreviewRepository;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.service.ProjectFilesChanged;
import com.singularity.workspace.service.impl.PreviewRunnerPool.ExecResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Keeps a running preview level with its project's files, without anyone pressing anything.
 *
 * <p>Handles: noticing that a project's current revision is newer than the one its runner was brought up to, copying
 * the files across once more so that "up to date" is a fact rather than a hope about the watcher, reinstalling and
 * restarting the dev server when package.json is no longer the one that was installed, and recording the revision
 * the runner now stands at. Asked to look whenever a revision is published or a preview comes up, and by the reaper
 * on every sweep in case one of those was missed.
 *
 * <p>The watcher inside the runner already carries most edits across within a second, and Vite hot-reloads them. This
 * exists for what that leaves open. Nothing could say when an edit had actually arrived, so the tab could not tell
 * "your change is live" from "still on its way". A watcher that had died delivered nothing until the next sweep
 * relaunched it. And a new package was installed only if the browser tab that ran the turn noticed and asked - a
 * collaborator's tab, or a restore, got a preview that failed on an import it could not resolve.
 *
 * <p>Whether packages need installing is decided in the runner, by comparing package.json with the one that was
 * installed, not from the list of paths a turn changed: a restore or an edit that only reorders the file is then
 * handled correctly without anyone having to describe it. The reinstall is the ordinary restart - same pod, same
 * address, the status back to starting - so its failures are reported exactly as a first start's are.
 *
 * <p>A copy that fails is tried once more on the spot - the person is looking at "Updating" - and after that is left
 * to the next sweep, with the old revision still recorded so the preview goes on saying it is behind.
 *
 * <p>One pass at a time per project, and a request that arrives during a pass makes it go round once more rather
 * than queueing a second one behind it. That bookkeeping is in memory and per instance; two instances working on the
 * same project would each copy the files, which is harmless, and the restart is a conditional update only one wins.
 *
 * <p>The listener waits for the publishing transaction to commit when there is one - a restore runs inside one - so
 * it never reads the revision from before the change it was told about.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class PreviewSynchronizer {

    static final String APPLYING = "Applying your changes";
    static final String INSTALLING = "Installing new packages";

    private final PreviewRepository previewRepository;
    private final ProjectRepository projectRepository;
    private final PreviewBootstrapper bootstrapper;
    private final PreviewDeploymentServiceImpl deploymentService;

    private final Set<Long> inProgress = ConcurrentHashMap.newKeySet();
    private final Set<Long> askedAgain = ConcurrentHashMap.newKeySet();

    @Async
    @TransactionalEventListener(fallbackExecution = true)
    public void onFilesChanged(ProjectFilesChanged event) {
        bringUpToDate(event.projectId());
    }

    public void bringUpToDate(Long projectId) {
        if (!inProgress.add(projectId)) {
            askedAgain.add(projectId);
            return;
        }
        try {
            do {
                askedAgain.remove(projectId);
                syncOnce(projectId);
            } while (askedAgain.contains(projectId));
        } catch (RuntimeException e) {
            log.warn("Couldn't bring the preview of project {} up to date; the next sweep tries again: {}",
                    projectId, e.getMessage());
        } finally {
            inProgress.remove(projectId);
        }
        if (askedAgain.remove(projectId)) bringUpToDate(projectId);
    }

    private void syncOnce(Long projectId) {
        Preview preview = previewRepository
                .findFirstByProjectIdAndStatusInOrderByIdDesc(projectId, List.of(PreviewStatus.RUNNING)).orElse(null);
        if (preview == null) return;

        Long current = projectRepository.findCurrentFileRevisionId(projectId).orElse(null);
        if (Objects.equals(current, preview.getSyncedRevisionId())) return;
        if (previewRepository.markSyncing(preview.getId(), APPLYING) == 0) return;

        ExecResult copy = bootstrapper.mirrorOnce(projectId, preview.getPodName());
        if (!copy.succeeded()) {
            log.warn("Couldn't copy revision {} into preview {}, trying once more: {}", current, preview.getId(), copy.output());
            copy = bootstrapper.mirrorOnce(projectId, preview.getPodName());
        }
        if (!copy.succeeded()) {
            log.warn("Couldn't copy revision {} into preview {}; the next sweep tries again: {}",
                    current, preview.getId(), copy.output());
            return;
        }

        if (bootstrapper.dependenciesChanged(preview.getPodName())) {
            log.info("package.json changed under preview {}; reinstalling for revision {}", preview.getId(), current);
            deploymentService.restartRunner(projectId, preview.getId(), INSTALLING);
            return;
        }

        previewRepository.markSynced(preview.getId(), current);
        log.info("Preview {} of project {} is up to date with revision {}", preview.getId(), projectId, current);
    }
}
