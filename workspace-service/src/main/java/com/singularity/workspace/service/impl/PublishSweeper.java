package com.singularity.workspace.service.impl;

import com.singularity.workspace.config.PublishingProperties;
import com.singularity.workspace.entity.PublishedApp;
import com.singularity.workspace.enums.PublishBuildStatus;
import com.singularity.workspace.enums.PublishFailureKind;
import com.singularity.workspace.enums.PublishStatus;
import com.singularity.workspace.repository.PublishedAppRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

/**
 * Looks after what a publish leaves behind.
 *
 * Handles: failing a build whose heartbeat has stopped - the service that was running it restarted, or its thread
 * died - so the panel stops saying "Publishing" over a build nobody is making, and deleting what an update or an
 * unpublish left behind once enough time has passed that no request in flight can still be reading it. For an app that is
 * unpublished it also removes the pointer again, which is what makes a take-down whose first attempt could not reach
 * storage finish by itself.
 *
 * <p>What is deleted is every build the app has in storage except the one that is live and the one being made, not just
 * the prefix the row remembers. The row remembers one, and two changes in quick succession - an update, then an unpublish
 * - would otherwise leave the older build stored for good: found on a real cluster, where Unpublish straight after an
 * update left the live build, and the sources stored beside it, in the bucket.
 *
 * <p>A failed delete is logged and left for the next pass: the retired prefix stays on the row until it has really
 * gone. The failure of an abandoned build is the platform's, so the panel offers to try again unchanged; the runner pod
 * it held is no longer named by any build, and the orphan sweep releases it.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class PublishSweeper {

    static final String ABANDONED = "The server restarted while your app was publishing. Try again.";

    private final PublishedAppRepository appRepository;
    private final PublishedStore store;
    private final PublishingProperties properties;

    @Scheduled(fixedDelayString = "${publishing.sweep-interval:20s}", initialDelayString = "${publishing.sweep-initial-delay:30s}")
    public void sweep() {
        try {
            failAbandonedBuilds();
            deleteRetiredBuilds();
        } catch (RuntimeException e) {
            log.warn("The publish sweep skipped a run: {}", e.getMessage());
        }
    }

    void failAbandonedBuilds() {
        Instant cutoff = Instant.now().minus(properties.heartbeatStaleAfter());
        for (PublishedApp app : appRepository.findBuildsWithoutHeartbeatSince(cutoff)) {
            if (appRepository.markFailed(app.getId(), app.getBuildNumber(), PublishFailureKind.PLATFORM, ABANDONED, null) > 0) {
                log.info("Failed build {} of {}: its heartbeat stopped at {}", app.getBuildNumber(), app.getSlug(),
                        app.getBuildHeartbeatAt());
            }
        }
    }

    void deleteRetiredBuilds() {
        Instant cutoff = Instant.now().minus(properties.retireAfter());
        for (PublishedApp app : appRepository.findRetiredBefore(cutoff)) {
            try {
                Set<String> keep = new HashSet<>();
                if (app.getLivePrefix() != null) keep.add(app.getLivePrefix());
                if (app.getBuildStatus() == PublishBuildStatus.BUILDING) keep.add(PublishedStore.buildPrefix(app.getBuildNumber()));
                for (String build : store.listBuildPrefixes(app.getSlug())) {
                    if (!keep.contains(build)) store.deleteBuild(app.getSlug(), build);
                }
                if (app.getStatus() == PublishStatus.UNPUBLISHED && app.getBuildStatus() == null) {
                    store.deletePointer(app.getSlug());
                }
                appRepository.clearRetired(app.getId(), app.getRetiredPrefix());
            } catch (RuntimeException e) {
                log.warn("Couldn't delete the retired build {} of {}; trying again next pass: {}",
                        app.getRetiredPrefix(), app.getSlug(), e.getMessage());
            }
        }
    }
}
