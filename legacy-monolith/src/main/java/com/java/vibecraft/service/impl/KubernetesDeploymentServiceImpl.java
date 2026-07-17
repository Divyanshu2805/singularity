package com.java.vibecraft.service.impl;

import com.java.vibecraft.config.PreviewProperties;
import com.java.vibecraft.dto.deploy.PreviewLogsResponse;
import com.java.vibecraft.dto.deploy.PreviewResponse;
import com.java.vibecraft.entity.Plan;
import com.java.vibecraft.entity.Preview;
import com.java.vibecraft.entity.PreviewSession;
import com.java.vibecraft.entity.Project;
import com.java.vibecraft.enums.PreviewStatus;
import com.java.vibecraft.error.CapacityUnavailableException;
import com.java.vibecraft.error.ExternalServiceException;
import com.java.vibecraft.error.QuotaExceededException;
import com.java.vibecraft.error.ResourceNotFoundException;
import com.java.vibecraft.repository.PreviewRepository;
import com.java.vibecraft.repository.PreviewSessionRepository;
import com.java.vibecraft.repository.ProjectRepository;
import com.java.vibecraft.security.AuthUtil;
import com.java.vibecraft.service.DeploymentService;
import com.java.vibecraft.service.SubscriptionService;
import io.fabric8.kubernetes.api.model.Pod;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Live previews on the Kubernetes runner pool. The moving parts, each in its own class:
 * {@link PreviewRunnerPool} (claiming and running commands in pods), {@link PreviewBootstrapper} (sync, install,
 * start - asynchronously), {@link PreviewRouter} (the Redis routes the proxy serves), {@link PreviewLifecycle}
 * (ending a runner cleanly) and {@code PreviewReaper} (stopping idle ones, sweeping leftovers).
 *
 * <p><b>Runner per project, session per person.</b> A {@link Preview} row is the runner: collaborators share it, since
 * they edit the same files. Everything a person sees and does goes through their own {@link PreviewSession}: the tab
 * shows a preview as running only while <em>they</em> have one open, Stop ends only theirs (the runner goes once no
 * session is left), and the plan allowance counts only theirs. Joining a runner a collaborator already started is
 * instant - no second install.
 *
 * <p>Deliberately <b>not</b> {@code @Transactional}: every status change is a single conditional UPDATE, and the async
 * bootstrap must see the CREATING row committed before it starts.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class KubernetesDeploymentServiceImpl implements DeploymentService {

    static final List<PreviewStatus> ACTIVE = List.of(PreviewStatus.CREATING, PreviewStatus.RUNNING);

    /** What a session's end reason is when the person pressed Stop. The client won't auto-start over it. */
    static final String STOPPED_BY_USER = "Stopped";

    /** How often a poll may write a visit - the tab polls every few seconds while starting. */
    private static final Duration TOUCH_THROTTLE = Duration.ofSeconds(30);
    private static final String SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final PreviewRepository previewRepository;
    private final PreviewSessionRepository sessionRepository;
    private final ProjectRepository projectRepository;
    private final PreviewRunnerPool runnerPool;
    private final PreviewRouter router;
    private final PreviewBootstrapper bootstrapper;
    private final PreviewLifecycle lifecycle;
    private final PreviewProperties properties;
    private final SubscriptionService subscriptionService;
    private final AuthUtil authUtil;

    /**
     * One start/stop at a time per project, so two people opening Preview together share one runner rather than
     * claiming two, and a Stop can't shut a runner someone is joining. In-process only: with more than one backend
     * instance this needs a distributed lock (Redis SETNX).
     */
    private final ConcurrentHashMap<Long, Object> projectLocks = new ConcurrentHashMap<>();

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public PreviewResponse startPreview(Long projectId) {
        Long userId = authUtil.getCurrentUserId();

        synchronized (lockFor(projectId)) {
            Preview runner = activeRunner(projectId).orElse(null);

            Optional<PreviewSession> open = sessionRepository.findFirstByProjectIdAndUserIdAndEndedAtIsNullOrderByIdDesc(projectId, userId);
            if (open.isPresent() && runner != null && runner.getId().equals(open.get().getPreview().getId())) {
                markVisited(runner, open.get());
                return toResponse(runner, open.get(), null);
            }
            open.ifPresent(stale -> sessionRepository.end(stale.getId(), "Replaced", Instant.now()));

            assertWithinPreviewAllowance(userId);

            if (runner == null) {
                runner = startRunner(projectId, userId);
            } else {
                log.info("User {} joined preview {} of project {}", userId, runner.getId(), projectId);
            }

            Instant now = Instant.now();
            PreviewSession session = sessionRepository.save(PreviewSession.builder()
                    .preview(runner)
                    .projectId(projectId)
                    .userId(userId)
                    .startedAt(now)
                    .lastSeenAt(now)
                    .failed(false)
                    .build());
            return toResponse(runner, session, null);
        }
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public Optional<PreviewResponse> getPreview(Long projectId) {
        Long userId = authUtil.getCurrentUserId();
        return sessionRepository.findFirstByProjectIdAndUserIdOrderByIdDesc(projectId, userId).map(session -> {
            Preview runner = session.getPreview();
            if (session.getEndedAt() == null && runner.getStatus() == PreviewStatus.RUNNING) {
                markVisited(runner, session);
            }
            return toResponse(runner, session, null);
        });
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public PreviewResponse restartPreview(Long projectId) {
        Long userId = authUtil.getCurrentUserId();
        synchronized (lockFor(projectId)) {
            Optional<PreviewSession> open = sessionRepository.findFirstByProjectIdAndUserIdAndEndedAtIsNullOrderByIdDesc(projectId, userId);
            Preview runner = activeRunner(projectId).orElse(null);
            if (open.isEmpty() || runner == null || !runner.getId().equals(open.get().getPreview().getId())) {
                return startPreview(projectId);
            }
            if (runner.getStatus() == PreviewStatus.CREATING) {
                return toResponse(runner, open.get(), null); // already on its way up
            }
            if (previewRepository.markRestarting(runner.getId(), "Restarting the dev server", Instant.now()) == 0) {
                return startPreview(projectId);
            }

            // The runner is shared, so this restarts it for everyone with it open - which is right: it's the same
            // dependencies for all of them. The route comes down so the proxy answers "restarting", not a broken page.
            router.remove(runner.getHostname());
            bootstrapper.stopDevServer(runner.getPodName());
            bootstrapper.start(runner.getId(), projectId, false);
            log.info("User {} restarted preview {} for project {}", userId, runner.getId(), projectId);

            Preview restarted = previewRepository.findById(runner.getId()).orElse(runner);
            return toResponse(restarted, open.get(), null);
        }
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public void stopPreview(Long projectId) {
        Long userId = authUtil.getCurrentUserId();
        synchronized (lockFor(projectId)) {
            sessionRepository.findFirstByProjectIdAndUserIdAndEndedAtIsNullOrderByIdDesc(projectId, userId)
                    .ifPresent(session -> {
                        // Loaded in full first: end() clears the persistence context, and a lazy proxy left
                        // uninitialised by then couldn't be read afterwards.
                        Preview runner = previewRepository.findById(session.getPreview().getId()).orElseThrow();
                        sessionRepository.end(session.getId(), STOPPED_BY_USER, Instant.now());
                        shutDownIfUnused(runner, STOPPED_BY_USER);
                    });
        }
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public PreviewLogsResponse getPreviewLogs(Long projectId) {
        Long userId = authUtil.getCurrentUserId();
        Preview runner = sessionRepository.findFirstByProjectIdAndUserIdOrderByIdDesc(projectId, userId)
                .map(PreviewSession::getPreview)
                .orElseThrow(() -> new ResourceNotFoundException("Preview for project", projectId.toString()));

        if (ACTIVE.contains(runner.getStatus())) {
            try {
                return new PreviewLogsResponse(bootstrapper.readLogs(runner.getPodName()), true);
            } catch (ExternalServiceException e) {
                log.warn("Couldn't read logs for preview {}: {}", runner.getId(), e.getMessage());
                return new PreviewLogsResponse("Couldn't read the runner's output right now.", true);
            }
        }
        return new PreviewLogsResponse(runner.getFailureLog(), false);
    }

    @Override
    public List<PreviewResponse> getMyActivePreviews() {
        Long userId = authUtil.getCurrentUserId();
        return sessionRepository.findOpenByUserWithPreview(userId).stream()
                .map(session -> toResponse(session.getPreview(), session, session.getPreview().getProject().getName()))
                .toList();
    }

    @Override
    public int countActivePreviews(Long userId) {
        return sessionRepository.countByUserIdAndEndedAtIsNull(userId);
    }

    @Override
    public void stopAllForProject(Long projectId, String reason) {
        synchronized (lockFor(projectId)) {
            previewRepository.findByProjectIdAndStatusIn(projectId, ACTIVE)
                    .forEach(runner -> lifecycle.terminate(runner, reason));
        }
    }

    /** Ends a runner nobody has open any more. Call with {@link #lockFor} held. Public because the reaper reaches it
     * through this bean's security proxy, which only forwards public methods to the real instance. */
    public void shutDownIfUnused(Preview runner, String reason) {
        if (sessionRepository.countByPreviewIdAndEndedAtIsNull(runner.getId()) == 0) {
            lifecycle.terminate(runner, reason);
        }
    }

    public Object lockFor(Long projectId) {
        return projectLocks.computeIfAbsent(projectId, id -> new Object());
    }

    /** The project's starting or running runner, ending one whose pod has vanished (evicted, deleted by hand). */
    private Optional<Preview> activeRunner(Long projectId) {
        Optional<Preview> runner = previewRepository.findFirstByProjectIdAndStatusInOrderByIdDesc(projectId, ACTIVE);
        if (runner.isPresent() && !runnerPool.isAlive(runner.get().getPodName())) {
            lifecycle.terminate(runner.get(), "The preview's runner stopped unexpectedly");
            return Optional.empty();
        }
        return runner;
    }

    private Preview startRunner(Long projectId, Long userId) {
        Project project = projectRepository.findById(projectId)
                .filter(p -> p.getDeletedAt() == null)
                .orElseThrow(() -> new ResourceNotFoundException("Project", projectId.toString()));

        Pod pod = runnerPool.claim(projectId).orElseThrow(() -> new CapacityUnavailableException(
                "Every preview runner is busy right now. Try again in a minute."));

        String hostname = previewRepository.findLatestHostname(projectId).orElseGet(() -> newHostname(projectId));
        Instant now = Instant.now();
        Preview runner = previewRepository.save(Preview.builder()
                .project(project)
                .namespace(properties.namespace())
                .podName(pod.getMetadata().getName())
                .hostname(hostname)
                .previewUrl(properties.urlFor(hostname))
                .startedByUserId(userId)
                .status(PreviewStatus.CREATING)
                .detail("Starting a runner")
                .startedAt(now)
                .lastAccessedAt(now)
                .build());

        log.info("Starting preview {} for project {} in pod {}", runner.getId(), projectId, runner.getPodName());
        bootstrapper.start(runner.getId(), projectId, true);
        return runner;
    }

    private void assertWithinPreviewAllowance(Long userId) {
        int allowance = subscriptionService.previewAllowance(userId);
        int open = countActivePreviews(userId);
        if (open < allowance) return;

        Plan plan = subscriptionService.getActivePlan(userId);
        String planName = plan != null ? plan.getName() : "Free";
        throw new QuotaExceededException(
                "Your " + planName + " plan runs " + allowance + " live " + (allowance == 1 ? "preview" : "previews")
                        + " at a time. Stop one, or upgrade to run more.",
                QuotaExceededException.Reason.PREVIEW_LIMIT, allowance, open, null, planName);
    }

    /** Keeps an in-use preview alive: this person's idle clock, the runner's, and the route's expiry. */
    private void markVisited(Preview runner, PreviewSession session) {
        Instant now = Instant.now();
        if (session.getLastSeenAt() != null && session.getLastSeenAt().plus(TOUCH_THROTTLE).isAfter(now)) {
            return;
        }
        sessionRepository.touch(session.getId(), now);
        session.setLastSeenAt(now);
        previewRepository.touch(runner.getId(), now);
        if (runner.getStatus() == PreviewStatus.RUNNING) {
            try {
                router.refresh(runner.getHostname());
            } catch (ExternalServiceException e) {
                log.warn("Couldn't refresh the route for preview {}: {}", runner.getId(), e.getMessage());
            }
        }
    }

    /**
     * What this person's tab shows. While their session is open it follows the runner; once it has ended it shows how
     * <em>their</em> session ended - "Stopped" stays stopped for them even while a collaborator's keeps running.
     * {@code id} is the session's, so each start is a distinct preview to the client.
     */
    private PreviewResponse toResponse(Preview runner, PreviewSession session, String projectName) {
        boolean open = session.getEndedAt() == null;
        PreviewStatus status = open ? runner.getStatus()
                : Boolean.TRUE.equals(session.getFailed()) ? PreviewStatus.FAILED : PreviewStatus.TERMINATED;
        Instant stopsAt = open && runner.getStatus() == PreviewStatus.RUNNING && session.getLastSeenAt() != null
                ? session.getLastSeenAt().plus(properties.idleTimeout())
                : null;
        return new PreviewResponse(
                session.getId(),
                session.getProjectId(),
                projectName,
                status,
                runner.getPreviewUrl(),
                open ? runner.getDetail() : session.getEndReason(),
                open ? runner.getStartedAt() : session.getStartedAt(),
                open ? runner.getReadyAt() : null,
                open ? null : session.getEndedAt(),
                stopsAt,
                open);
    }

    /**
     * {@code p<id>-<10 random chars>}: the id keeps it recognisable in logs, the random part keeps someone from
     * walking project ids to find other people's previews. One DNS label, well under the 63-character limit.
     */
    private String newHostname(Long projectId) {
        StringBuilder slug = new StringBuilder("p").append(projectId).append('-');
        for (int i = 0; i < 10; i++) {
            slug.append(SLUG_ALPHABET.charAt(RANDOM.nextInt(SLUG_ALPHABET.length())));
        }
        return slug + "." + properties.publicDomain();
    }
}
