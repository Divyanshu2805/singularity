package com.singularity.workspace.service.impl;

import com.singularity.common.dto.PlanDto;
import com.singularity.common.error.BadRequestException;
import com.singularity.common.error.ConflictException;
import com.singularity.common.error.QuotaExceededException;
import com.singularity.common.error.RateLimitExceededException;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.common.feign.AccountServiceClient;
import com.singularity.common.security.AuthUtil;
import com.singularity.workspace.config.InstanceId;
import com.singularity.workspace.config.PublishingProperties;
import com.singularity.workspace.dto.publish.PublishBuild;
import com.singularity.workspace.dto.publish.PublishLogResponse;
import com.singularity.workspace.dto.publish.PublishRequest;
import com.singularity.workspace.dto.publish.PublishResponse;
import com.singularity.workspace.entity.Project;
import com.singularity.workspace.entity.PublishedApp;
import com.singularity.common.error.FileStorageException;
import com.singularity.workspace.enums.PublishBuildStatus;
import com.singularity.workspace.enums.PublishStatus;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.repository.PublishedAppRepository;
import com.singularity.workspace.service.PublishService;
import com.singularity.workspace.util.PublishedSlug;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

/**
 * A project's published app, from the request side.
 *
 * <p>Handles: reading where a project's publish stands, starting a build (the first publish or an update), checking the
 * owner's plan allowance for live apps and the limits on how often a build may start, choosing or validating the link's
 * name, unpublishing, sharing the code, reading a failed build's output, and taking an app down when its project is
 * deleted. The build itself is {@link PublishBuilder}'s, off the request thread.
 *
 * <p>Who may do what. Anyone who may view the project may read its state; only the owner (the PUBLISH permission) may
 * publish, update, unpublish or share, and the guards sit on these methods because the caller is a user. {@code
 * takeDown} and {@code liveUrls} are for the service itself and carry no guard.
 *
 * <p>The link's name is chosen once, at the first publish, and kept for the life of the project - through unpublishing
 * and publishing again - so a link someone saved keeps meaning the same app. Asking for a different one later is
 * refused, not ignored.
 *
 * <p>A start is serialized per person in memory, so two presses cannot both pass the allowance check before either has
 * taken effect; the one-build-at-a-time rule and the spacing between builds are a conditional update in the database
 * and hold across instances. Pressing Publish while a build is running answers with the build already under way
 * rather than an error.
 *
 * <p>Taking an app down removes its pointer first, because that single object is what the proxy serves from; the row is
 * changed after, so a failure to reach storage leaves the app visibly published and the call can be repeated instead of
 * leaving a page that is online while the record says it is not.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PublishServiceImpl implements PublishService {

    private static final int SLUG_ATTEMPTS = 8;

    private final PublishedAppRepository appRepository;
    private final ProjectRepository projectRepository;
    private final PublishedStore store;
    private final PublishBuilder builder;
    private final PublishingProperties properties;
    private final PublishRateLimiter rateLimiter;
    private final AuthUtil authUtil;
    private final AccountServiceClient accountServiceClient;
    private final InstanceId instanceId;

    private final ConcurrentHashMap<Long, Object> userLocks = new ConcurrentHashMap<>();

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public PublishResponse getStatus(Long projectId) {
        Project project = liveProject(projectId);
        return toResponse(project, appRepository.findByProjectId(projectId).orElse(null));
    }

    @Override
    @PreAuthorize("@security.canPublishProject(#projectId)")
    public PublishResponse publish(Long projectId, PublishRequest request) {
        Long userId = authUtil.getCurrentUserId();
        Project project = liveProject(projectId);
        String requestedSlug = request == null || request.slug() == null || request.slug().isBlank()
                ? null : request.slug();

        synchronized (userLocks.computeIfAbsent(userId, id -> new Object())) {
            PublishedApp app = appRepository.findByProjectId(projectId).orElse(null);
            if (app != null && app.getBuildStatus() == PublishBuildStatus.BUILDING) {
                return toResponse(project, app);
            }
            if (app != null && requestedSlug != null && !app.getSlug().equals(requestedSlug.strip().toLowerCase())) {
                throw new BadRequestException("This app keeps the link name it was first published with.");
            }

            Instant now = Instant.now();
            rateLimiter.check(userId, properties.maxBuildsPerHour(), now);
            if (app == null || app.getStatus() != PublishStatus.LIVE) {
                assertWithinAllowance(userId);
            }
            if (app == null) {
                app = createRow(project, requestedSlug);
            }

            int claimed = appRepository.claimBuild(app.getId(), userId, instanceId.value(),
                    PublishBuilder.COLLECTING, now, now.minus(properties.minBuildInterval()));
            if (claimed == 0) {
                PublishedApp current = appRepository.findById(app.getId()).orElse(app);
                if (current.getBuildStatus() == PublishBuildStatus.BUILDING) {
                    return toResponse(project, current);
                }
                Instant next = current.getBuildStartedAt() == null ? now
                        : current.getBuildStartedAt().plus(properties.minBuildInterval());
                throw new RateLimitExceededException(Math.max(1, Duration.between(now, next).toSeconds()));
            }
            rateLimiter.record(userId, now);

            PublishedApp started = appRepository.findById(app.getId()).orElseThrow();
            log.info("User {} started build {} of the app {} for project {}", userId, started.getBuildNumber(),
                    started.getSlug(), projectId);
            builder.run(started.getId(), started.getSlug(), started.getBuildNumber(), projectId);
            return toResponse(project, started);
        }
    }

    @Override
    @PreAuthorize("@security.canPublishProject(#projectId)")
    public void unpublish(Long projectId) {
        PublishedApp app = appRepository.findByProjectId(projectId).orElse(null);
        if (app == null || (app.getStatus() == PublishStatus.UNPUBLISHED && app.getBuildStatus() == null)) {
            return;
        }
        store.deletePointer(app.getSlug());
        appRepository.markUnpublished(app.getId(), Instant.now());
        projectRepository.setPublic(projectId, false);
        log.info("User {} unpublished the app {} of project {}", authUtil.getCurrentUserId(), app.getSlug(), projectId);
    }

    @Override
    @PreAuthorize("@security.canPublishProject(#projectId)")
    public PublishResponse setSharing(Long projectId, boolean shared) {
        Project project = liveProject(projectId);
        PublishedApp app = appRepository.findByProjectId(projectId).orElse(null);
        if (app == null || app.getStatus() != PublishStatus.LIVE) {
            throw new BadRequestException("Publish the app before sharing its code.");
        }
        projectRepository.setPublic(projectId, shared);
        project.setIsPublic(shared);
        return toResponse(project, app);
    }

    @Override
    @PreAuthorize("@security.canPublishProject(#projectId)")
    public PublishLogResponse getBuildLog(Long projectId) {
        return new PublishLogResponse(appRepository.findByProjectId(projectId)
                .map(PublishedApp::getFailureLog).orElse(null));
    }

    @Override
    public void takeDown(Long projectId) {
        PublishedApp app = appRepository.findByProjectId(projectId).orElse(null);
        if (app == null) {
            return;
        }
        try {
            store.deletePointer(app.getSlug());
        } catch (FileStorageException e) {
            log.error("Couldn't remove the pointer of {} while taking it down; the sweeper will retry", app.getSlug(), e);
        }
        appRepository.markUnpublished(app.getId(), Instant.now());
        projectRepository.setPublic(projectId, false);
        log.info("Took down the app {} of project {}", app.getSlug(), projectId);
    }

    @Override
    public Map<Long, String> liveUrls(Collection<Long> projectIds) {
        Map<Long, String> urls = new HashMap<>();
        if (projectIds == null || projectIds.isEmpty()) {
            return urls;
        }
        appRepository.findByProjectIdsAndStatus(projectIds, PublishStatus.LIVE)
                .forEach(app -> urls.put(app.getProjectId(), properties.urlFor(app.getSlug())));
        return urls;
    }

    private Project liveProject(Long projectId) {
        return projectRepository.findById(projectId)
                .filter(project -> project.getDeletedAt() == null)
                .orElseThrow(() -> new ResourceNotFoundException("Project", projectId.toString()));
    }

    private void assertWithinAllowance(Long userId) {
        PlanDto plan = accountServiceClient.getPlanLimits(userId);
        int limit = properties.limitFor(plan.name());
        int live = appRepository.countLiveOwnedBy(userId);
        if (live < limit) {
            return;
        }
        throw new QuotaExceededException(
                "The " + plan.name() + " plan keeps " + limit + (limit == 1 ? " app" : " apps")
                        + " published at a time. Unpublish one, or upgrade to publish more.",
                QuotaExceededException.Reason.PUBLISH_LIMIT, limit, live, null, plan.name());
    }

    private PublishedApp createRow(Project project, String requestedSlug) {
        if (requestedSlug != null) {
            String slug = PublishedSlug.validate(requestedSlug);
            if (appRepository.existsBySlug(slug)) {
                throw new ConflictException("That link name is taken. Choose another.");
            }
            try {
                return appRepository.save(newRow(project, slug));
            } catch (DataIntegrityViolationException e) {
                throw new ConflictException("That link name is taken. Choose another.");
            }
        }
        for (int attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
            String slug = PublishedSlug.suggest(project.getName());
            if (appRepository.existsBySlug(slug)) continue;
            try {
                return appRepository.save(newRow(project, slug));
            } catch (DataIntegrityViolationException e) {
                if (appRepository.findByProjectId(project.getId()).isPresent()) {
                    return appRepository.findByProjectId(project.getId()).orElseThrow();
                }
            }
        }
        throw new ConflictException("Couldn't find a free link name just now. Try again.");
    }

    private static PublishedApp newRow(Project project, String slug) {
        return PublishedApp.builder().project(project).slug(slug).status(PublishStatus.UNPUBLISHED).build();
    }

    private PublishResponse toResponse(Project project, PublishedApp app) {
        if (app == null) {
            return new PublishResponse(false, null, null, PublishedSlug.suggest(project.getName()), null,
                    false, false, null);
        }
        boolean live = app.getStatus() == PublishStatus.LIVE;
        boolean changed = live && !Objects.equals(project.getCurrentFileRevisionId(), app.getLiveRevisionId());
        boolean shared = live && Boolean.TRUE.equals(project.getIsPublic());
        PublishBuild build = app.getBuildStatus() == null ? null : new PublishBuild(
                app.getBuildStatus(), app.getBuildDetail(), app.getBuildStartedAt(),
                app.getFailureKind(), app.getFailureDetail());
        return new PublishResponse(live, live ? properties.urlFor(app.getSlug()) : null, app.getSlug(), null,
                app.getPublishedAt(), changed, shared, build);
    }
}
