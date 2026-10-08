package com.singularity.workspace.service.impl;

import com.singularity.workspace.config.InstanceId;
import com.singularity.workspace.config.PreviewProperties;
import com.singularity.workspace.entity.Preview;
import com.singularity.workspace.entity.PreviewSession;
import com.singularity.workspace.enums.PreviewFailureKind;
import com.singularity.workspace.enums.PreviewStatus;
import com.singularity.common.error.ExternalServiceException;
import com.singularity.workspace.repository.PreviewRepository;
import com.singularity.workspace.repository.PreviewSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import static com.singularity.workspace.service.impl.PreviewDeploymentServiceImpl.ACTIVE;

/**
 * Stops previews nobody is using and sweeps what earlier runs left behind.
 *
 * <p>Handles: failing any preview left mid-start by a restart, ending sessions that have gone idle, failing a start
 * that overran its timeout, ending a preview whose pod has vanished or whose dev server has crashed or gone
 * unresponsive, relaunching a file-sync watcher that died, keeping alive a preview being visited directly through
 * the proxy (and re-publishing its route if Redis lost it), shutting down a runner once no session is left on it,
 * releasing claimed pods that no active preview owns, and asking the synchronizer to bring level any running preview
 * that a published revision's own notice did not reach.
 *
 * <p>A restart kills any bootstrap that was in flight, so a still-creating row from before can never finish; failing
 * those immediately is better than leaving the tab spinning until the timeout. The cluster or Redis being unreachable
 * - a sleeping laptop, a stopped cluster - is logged once rather than every minute.
 *
 * <p>Every per-preview action - reviving a lost route, shutting down an idle runner, failing a stuck one - re-reads
 * the row under its project's lock immediately before acting, rather than trusting the snapshot this class's own
 * {@code reap()} fetched a moment earlier: that snapshot can go stale mid-run against a concurrent Stop or restart,
 * and acting on it regardless is exactly how a just-stopped preview's route got resurrected once (CODE_REVIEW.md
 * PRE-02).
 *
 * <p>A RUNNING preview's pod staying "Running" says nothing about the dev server or the file-sync watcher inside it
 * (PRE-06) - a crashed dev server is failed immediately (an unambiguous signal: its process actually exited), while
 * one that stops merely answering gets a few consecutive misses' grace ({@code unresponsiveStreak}, per instance and
 * cleared whenever a preview recovers or stops being active) before being treated as wedged, so one slow response
 * does not end a healthy preview. A dead watcher does not end the preview at all - it is relaunched and logged,
 * since the dev server can still serve whatever it already has.
 *
 * <p>A start whose bootstrap has stopped proving it is alive is failed on a sweep, not only at startup. The startup
 * check leaves alone any row whose heartbeat is younger than thirty seconds, so that a rolling deployment's new
 * instance does not fail work an older one is still doing - which also means a single instance that restarts in
 * under thirty seconds leaves its own interrupted start untouched, and nothing looked at it again until the boot
 * timeout and its grace had passed: six minutes of "Starting your preview" over a start nobody was running. A
 * bootstrap touches its heartbeat every couple of seconds except while one command runs in the pod, and the longest
 * of those is the file copy, bounded at forty-five seconds; a heartbeat seventy-five seconds old belongs to no living
 * bootstrap. Raise the two together or not at all.
 * The failure is the platform's, so the tab starts the preview again by itself.
 *
 * <p>A start that is waiting in line has no pod, and is given the line's own limit rather than the boot timeout: it is
 * not stuck, it is waiting, and the bootstrap that owns it fails it itself when the limit passes. This sweep only
 * catches the one whose bootstrap died without saying so.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class PreviewReaper {

    private static final Duration ORPHAN_GRACE = Duration.ofMinutes(2);
    private static final Duration STUCK_GRACE = Duration.ofMinutes(2);
    private static final Duration BOOTSTRAP_HEARTBEAT_GRACE = Duration.ofSeconds(30);
    private static final Duration ABANDONED_AFTER = Duration.ofSeconds(75);
    private static final int UNRESPONSIVE_LIMIT = 3;

    private final PreviewRepository previewRepository;
    private final PreviewSessionRepository sessionRepository;
    private final PreviewRunnerPool runnerPool;
    private final PreviewRouter router;
    private final PreviewBootstrapper bootstrapper;
    private final PreviewLifecycle lifecycle;
    private final PreviewProperties properties;
    private final PreviewDeploymentServiceImpl deploymentService;
    private final PreviewSynchronizer synchronizer;
    private final InstanceId instanceId;

    private final ConcurrentHashMap<Long, Integer> unresponsiveStreak = new ConcurrentHashMap<>();

    private volatile boolean lastRunFailed;

    /**
     * Only fails a CREATING row whose bootstrap heartbeat is missing or stale (CODE_REVIEW.md PRE-03): every other
     * instance in a rolling deployment fires this same event on its own startup, and a blanket sweep would fail
     * whatever bootstrap an older, still-live instance happens to be running at that exact moment. A heartbeat this
     * old cannot belong to a process that is still polling it every couple of seconds, whichever instance it was -
     * including a previous run of this same one, which is the original, still-covered case.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void failInterruptedStarts() {
        try {
            Instant cutoff = Instant.now().minus(BOOTSTRAP_HEARTBEAT_GRACE);
            previewRepository.findByStatusIn(List.of(PreviewStatus.CREATING)).stream()
                    .filter(preview -> preview.getBootstrapHeartbeatAt() == null
                            || preview.getBootstrapHeartbeatAt().isBefore(cutoff))
                    .forEach(preview -> {
                        log.info("Instance {} failing preview {} abandoned by instance {} (last heartbeat {})",
                                instanceId.value(), preview.getId(), preview.getBootstrapOwner(), preview.getBootstrapHeartbeatAt());
                        lifecycle.fail(preview, PreviewFailureKind.PLATFORM,
                                "The server restarted while this preview was starting. Start it again.", null);
                    });
        } catch (RuntimeException e) {
            log.warn("Couldn't clean up previews interrupted by a restart: {}", e.getMessage());
        }
    }

    @Scheduled(fixedDelayString = "${preview.reap-interval:60s}", initialDelayString = "${preview.reap-initial-delay:30s}")
    public void reap() {
        try {
            Instant now = Instant.now();
            endIdleSessions(now);

            List<Preview> active = previewRepository.findByStatusIn(ACTIVE);
            for (Preview preview : active) {
                if (preview.getStatus() == PreviewStatus.CREATING) {
                    reapIfStuck(preview, now);
                } else if (reapIfUnusedOrGone(preview, now)) {
                    synchronizer.bringUpToDate(preview.getProjectId());
                }
            }
            sweepOrphanPods(active, now);
            unresponsiveStreak.keySet().retainAll(active.stream().map(Preview::getId).collect(Collectors.toSet()));

            if (lastRunFailed) log.info("Preview reaper reconnected");
            lastRunFailed = false;
        } catch (ExternalServiceException e) {
            if (!lastRunFailed) log.warn("Preview reaper skipped a run: {}", e.getMessage());
            lastRunFailed = true;
        }
    }

    private void endIdleSessions(Instant now) {
        Instant cutoff = now.minus(properties.idleTimeout());
        for (PreviewSession session : sessionRepository.findByEndedAtIsNullAndLastSeenAtBefore(cutoff)) {
            sessionRepository.end(session.getId(), "Stopped after " + properties.idleTimeout().toMinutes()
                    + " minutes without a visit", now);
        }
    }

    private void reapIfStuck(Preview preview, Instant now) {
        Instant heartbeat = preview.getBootstrapHeartbeatAt();
        if (heartbeat != null && heartbeat.plus(ABANDONED_AFTER).isBefore(now)) {
            log.info("Instance {} failing preview {}: its bootstrap (instance {}) last proved it was alive at {}",
                    instanceId.value(), preview.getId(), preview.getBootstrapOwner(), heartbeat);
            lifecycle.fail(preview, PreviewFailureKind.PLATFORM,
                    "The server restarted while this preview was starting. Start it again.", null);
            return;
        }
        Instant startedAt = preview.getLastAccessedAt() != null ? preview.getLastAccessedAt() : preview.getStartedAt();
        boolean waiting = preview.getPodName() == null;
        Duration limit = waiting ? properties.queueTimeout() : properties.bootTimeout();
        if (startedAt != null && startedAt.plus(limit).plus(STUCK_GRACE).isBefore(now)) {
            lifecycle.fail(preview, waiting ? PreviewFailureKind.CAPACITY : PreviewFailureKind.PLATFORM,
                    waiting ? "No preview runner came free in time. Try again in a little while."
                            : "The preview didn't finish starting", null);
        }
    }

    /**
     * Re-reads the preview under its project's lock before acting on it (CODE_REVIEW.md PRE-02): the row passed in
     * was fetched at the top of {@link #reap()}, and by the time this runs, a concurrent Stop/restart/removal may
     * have already ended it. Without the re-check, a request that arrived just after Stop removed the route - but
     * before it released the pod - could see "recently visited, route missing" and re-register a route to a pod
     * that is seconds from being deleted; nothing would ever clean that phantom route up again, since the preview is
     * no longer ACTIVE and future reap runs stop looking at it. Taking the same lock every other project-lifecycle
     * method already takes serializes this against them; like those, it is in-memory and per instance.
     *
     * <p>Answers whether the preview is still running, healthy and in use afterwards, which is when it is worth
     * checking that it has the project's current files - done by the caller, outside this lock, since a copy can
     * take a while and a restart takes the lock itself.
     */
    private boolean reapIfUnusedOrGone(Preview stale, Instant now) {
        synchronized (deploymentService.lockFor(stale.getProjectId())) {
            Preview preview = previewRepository.findById(stale.getId()).orElse(null);
            if (preview == null || !ACTIVE.contains(preview.getStatus())) return false;

            if (!runnerPool.isAlive(preview.getPodName())) {
                lifecycle.terminate(preview, "The preview's runner stopped unexpectedly");
                return false;
            }

            // Restarting flips a preview back to CREATING in place; its dev server is expected to be down or
            // bouncing right now; probing it here is exactly the false positive PRE-06 must not introduce.
            if (preview.getStatus() == PreviewStatus.RUNNING && !checkProcessHealth(preview)) {
                return false;
            }

            Instant proxyVisit = router.lastVisit(preview.getHostname()).orElse(null);
            boolean visitedRecently = proxyVisit != null && proxyVisit.plus(properties.idleTimeout()).isAfter(now);
            if (visitedRecently) {
                if (!router.refresh(preview.getHostname())) {
                    deploymentService.republishRoute(preview);
                }
                return preview.getStatus() == PreviewStatus.RUNNING;
            }

            deploymentService.shutDownIfUnused(preview, "Nobody has it open");
            return preview.getStatus() == PreviewStatus.RUNNING
                    && sessionRepository.countByPreviewIdAndEndedAtIsNull(preview.getId()) > 0;
        }
    }

    /**
     * Returns false once the preview has been terminated for a dead dev server, so the caller stops - true means the
     * preview is still healthy enough to keep going with its own route-visit check next.
     */
    private boolean checkProcessHealth(Preview preview) {
        PreviewBootstrapper.HealthCheck health = bootstrapper.checkHealth(preview.getPodName());

        if (!health.devServerAlive()) {
            unresponsiveStreak.remove(preview.getId());
            lifecycle.terminate(preview, "The dev server stopped unexpectedly");
            return false;
        }

        if (health.serving()) {
            unresponsiveStreak.remove(preview.getId());
        } else if (unresponsiveStreak.merge(preview.getId(), 1, Integer::sum) >= UNRESPONSIVE_LIMIT) {
            unresponsiveStreak.remove(preview.getId());
            lifecycle.terminate(preview, "The dev server stopped responding");
            return false;
        }

        if (!health.watcherAlive()) {
            log.warn("Live file sync died for preview {}; relaunching it", preview.getId());
            if (!bootstrapper.restartWatcher(preview.getProjectId(), preview.getPodName())) {
                log.warn("Couldn't relaunch live file sync for preview {}; edits won't reach it until it's restarted",
                        preview.getId());
            }
        }
        return true;
    }

    private void sweepOrphanPods(List<Preview> active, Instant now) {
        Set<String> owned = active.stream().map(Preview::getPodName).collect(Collectors.toSet());
        for (PreviewRunnerPool.ClaimedPod pod : runnerPool.claimedPods()) {
            if (owned.contains(pod.name())) continue;
            if (pod.claimedAt() != null && pod.claimedAt().plus(ORPHAN_GRACE).isAfter(now)) continue;
            log.info("Releasing runner pod {}, which no active preview owns", pod.name());
            runnerPool.release(pod.name());
        }
    }
}
