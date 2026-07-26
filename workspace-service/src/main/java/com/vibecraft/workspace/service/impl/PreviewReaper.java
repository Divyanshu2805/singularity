package com.vibecraft.workspace.service.impl;

import com.vibecraft.workspace.config.PreviewProperties;
import com.vibecraft.workspace.entity.Preview;
import com.vibecraft.workspace.entity.PreviewSession;
import com.vibecraft.workspace.enums.PreviewStatus;
import com.vibecraft.common.error.ExternalServiceException;
import com.vibecraft.workspace.repository.PreviewRepository;
import com.vibecraft.workspace.repository.PreviewSessionRepository;
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
import java.util.stream.Collectors;

import static com.vibecraft.workspace.service.impl.PreviewDeploymentServiceImpl.ACTIVE;

/**
 * Stops previews nobody is using and sweeps what earlier runs left behind.
 *
 * <p>Handles: failing any preview left mid-start by a restart, ending sessions that have gone idle, failing a start
 * that overran its timeout, ending a preview whose pod has vanished, keeping alive a preview being visited directly
 * through the proxy (and re-publishing its route if Redis lost it), shutting down a runner once no session is left on
 * it, and releasing claimed pods that no active preview owns.
 *
 * <p>A restart kills any bootstrap that was in flight, so a still-creating row from before can never finish; failing
 * those immediately is better than leaving the tab spinning until the timeout. The cluster or Redis being unreachable
 * - a sleeping laptop, a stopped cluster - is logged once rather than every minute.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class PreviewReaper {

    private static final Duration ORPHAN_GRACE = Duration.ofMinutes(2);
    private static final Duration STUCK_GRACE = Duration.ofMinutes(2);

    private final PreviewRepository previewRepository;
    private final PreviewSessionRepository sessionRepository;
    private final PreviewRunnerPool runnerPool;
    private final PreviewRouter router;
    private final PreviewLifecycle lifecycle;
    private final PreviewProperties properties;
    private final PreviewDeploymentServiceImpl deploymentService;

    private volatile boolean lastRunFailed;

    @EventListener(ApplicationReadyEvent.class)
    public void failInterruptedStarts() {
        try {
            previewRepository.findByStatusIn(List.of(PreviewStatus.CREATING)).forEach(preview ->
                    lifecycle.fail(preview, "The server restarted while this preview was starting. Start it again.", null));
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
                } else {
                    reapIfUnusedOrGone(preview, now);
                }
            }
            sweepOrphanPods(active, now);

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
        Instant startedAt = preview.getLastAccessedAt() != null ? preview.getLastAccessedAt() : preview.getStartedAt();
        if (startedAt != null && startedAt.plus(properties.bootTimeout()).plus(STUCK_GRACE).isBefore(now)) {
            lifecycle.fail(preview, "The preview didn't finish starting", null);
        }
    }

    private void reapIfUnusedOrGone(Preview preview, Instant now) {
        if (!runnerPool.isAlive(preview.getPodName())) {
            lifecycle.terminate(preview, "The preview's runner stopped unexpectedly");
            return;
        }

        Instant proxyVisit = router.lastVisit(preview.getHostname()).orElse(null);
        boolean visitedRecently = proxyVisit != null && proxyVisit.plus(properties.idleTimeout()).isAfter(now);
        if (visitedRecently) {
            if (!router.refresh(preview.getHostname())) {
                deploymentService.republishRoute(preview);
            }
            return;
        }

        synchronized (deploymentService.lockFor(preview.getProjectId())) {
            deploymentService.shutDownIfUnused(preview, "Nobody has it open");
        }
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
