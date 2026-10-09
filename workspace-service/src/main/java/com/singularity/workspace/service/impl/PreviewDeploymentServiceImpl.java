package com.singularity.workspace.service.impl;

import com.singularity.common.dto.PlanDto;
import com.singularity.workspace.config.PreviewProperties;
import com.singularity.workspace.dto.deploy.PreviewLogsResponse;
import com.singularity.workspace.dto.deploy.PreviewResponse;
import com.singularity.workspace.entity.Preview;
import com.singularity.workspace.entity.PreviewSession;
import com.singularity.workspace.entity.Project;
import com.singularity.workspace.enums.PreviewStatus;
import com.singularity.workspace.enums.PreviewSyncState;
import com.singularity.common.error.ExternalServiceException;
import com.singularity.common.error.QuotaExceededException;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.common.feign.AccountServiceClient;
import com.singularity.workspace.repository.PreviewRepository;
import com.singularity.workspace.repository.PreviewSessionRepository;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.common.security.AuthUtil;
import com.singularity.workspace.service.PreviewDeploymentService;
import com.singularity.workspace.util.PreviewAccessToken;
import io.fabric8.kubernetes.api.model.Pod;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import static com.singularity.workspace.service.impl.PreviewBootstrapper.STARTING_RUNNER;
import static com.singularity.workspace.service.impl.PreviewBootstrapper.WAITER_FRESHNESS;
import static com.singularity.workspace.service.impl.PreviewBootstrapper.WAITING_FOR_RUNNER;

/**
 * Live previews on the Kubernetes runner pool - the entry point the other preview classes hang off.
 *
 * <p>Handles: opening a preview for the caller (joining an existing runner, claiming a pod and starting one, or
 * joining the line for a pod when every one is busy), enforcing the plan's concurrent-preview allowance, recording
 * visits that keep a preview alive, restarting the dev server in place, closing a session and shutting the runner
 * down once nobody has it open, reading the runner's output, listing the caller's open previews, re-publishing a
 * route Redis has lost, and saying for each response where the caller stands in the line and whether the runner is
 * showing the project's current files.
 *
 * <p>Runner per project, session per person. The preview row is the runner: collaborators share it, since they edit
 * the same files. Everything a person sees and does goes through their own session - the tab shows a preview as
 * running only while they have one open, Stop ends only theirs, and the plan allowance counts only theirs. Joining a
 * runner a collaborator already started is instant, with no second install.
 *
 * <p>Who may do what. Any member - a viewer included - may open the preview, read its output and close their own
 * session: looking at the running app is what viewing a project means, their session counts against their own
 * plan, and closing it ends nobody else's. Restarting is for those who may edit, because it bounces the one dev
 * server every collaborator is looking at; a viewer could otherwise interrupt an editor mid-change as often as they
 * liked. A viewer who has no session open is not refused for that - the browser simply never offers them the button.
 *
 * <p>No idle runner is no longer an error. The start is recorded with no pod and the bootstrap waits in line for
 * one; "Every runner is busy, try again in a minute" asked the person to do by hand what the server can do by
 * itself. Someone who starts while others are already waiting goes to the back rather than taking a pod that came
 * free that instant.
 *
 * <p>Deliberately not transactional: every status change is a single conditional update, and the asynchronous
 * bootstrap must see the committed row before it starts.
 *
 * <p>The plan's concurrent-preview allowance is per user, across every project they can see - not per project - so
 * checking it has to be serialized against that same user's other concurrent starts too, not just against other
 * activity on the one project being started. {@code startPreview} takes a lock keyed on the user for exactly that
 * span, nested around the existing per-project lock (which still separately protects the "join or create a runner"
 * decision two collaborators opening the same project's preview at once must not both get wrong). Like the
 * per-project locks, this is in-memory and per instance: it closes the race within one running copy of this
 * service, not across replicas - the same limitation {@code GenerationRegistry} documents in intelligence-service
 * for the same reason.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PreviewDeploymentServiceImpl implements PreviewDeploymentService {

    static final List<PreviewStatus> ACTIVE = List.of(PreviewStatus.CREATING, PreviewStatus.RUNNING);

    static final String STOPPED_BY_USER = "Stopped";
    static final String RUNNER_GONE = "The preview's runner stopped unexpectedly";

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
    private final AccountServiceClient accountServiceClient;
    private final AuthUtil authUtil;

    private final ConcurrentHashMap<Long, Object> projectLocks = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Long, Object> userLocks = new ConcurrentHashMap<>();

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public PreviewResponse startPreview(Long projectId) {
        Long userId = authUtil.getCurrentUserId();

        // The user-scoped lock is what actually protects the plan's per-user allowance across different projects;
        // the project-scoped lock nested inside it is what protects the runner-per-project decision. Two different
        // users starting previews - even on the same project - only ever contend on the project lock, never on
        // each other's user lock.
        synchronized (userLockFor(userId)) {
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
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public Optional<PreviewResponse> getPreview(Long projectId) {
        Long userId = authUtil.getCurrentUserId();
        return sessionRepository.findFirstByProjectIdAndUserIdOrderByIdDesc(projectId, userId).map(session -> {
            Preview runner = session.getPreview();
            if (session.getEndedAt() == null && runner.getStatus() == PreviewStatus.RUNNING) {
                if (endIfRunnerGone(projectId, runner)) {
                    return sessionRepository.findById(session.getId())
                            .map(ended -> toResponse(ended.getPreview(), ended, null))
                            .orElseGet(() -> toResponse(runner, session, null));
                }
                markVisited(runner, session);
            }
            return toResponse(runner, session, null);
        });
    }

    @Override
    @PreAuthorize("@security.canEditProject(#projectId)")
    public PreviewResponse restartPreview(Long projectId) {
        Long userId = authUtil.getCurrentUserId();
        // Same outer-user/inner-project lock order as startPreview - this method falls through to startPreview in
        // two branches below, and acquiring the project lock first here while startPreview acquires the user lock
        // first would let two threads deadlock on each other's lock.
        synchronized (userLockFor(userId)) {
            synchronized (lockFor(projectId)) {
                Optional<PreviewSession> open = sessionRepository.findFirstByProjectIdAndUserIdAndEndedAtIsNullOrderByIdDesc(projectId, userId);
                Preview runner = activeRunner(projectId).orElse(null);
                if (open.isEmpty() || runner == null || !runner.getId().equals(open.get().getPreview().getId())) {
                    return startPreview(projectId);
                }
                if (runner.getStatus() == PreviewStatus.CREATING) {
                    return toResponse(runner, open.get(), null);
                }
                if (!bounce(projectId, runner, "Restarting the dev server")) {
                    return startPreview(projectId);
                }
                log.info("User {} restarted preview {} for project {}", userId, runner.getId(), projectId);

                Preview restarted = previewRepository.findById(runner.getId()).orElse(runner);
                return toResponse(restarted, open.get(), null);
            }
        }
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public void stopPreview(Long projectId) {
        Long userId = authUtil.getCurrentUserId();
        synchronized (lockFor(projectId)) {
            sessionRepository.findFirstByProjectIdAndUserIdAndEndedAtIsNullOrderByIdDesc(projectId, userId)
                    .ifPresent(session -> {
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
            if (runner.getPodName() == null) {
                return new PreviewLogsResponse("Waiting for a free runner - nothing has run yet.", true);
            }
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

    @Override
    public void endSessionForUser(Long projectId, Long userId, String reason) {
        synchronized (lockFor(projectId)) {
            sessionRepository.findFirstByProjectIdAndUserIdAndEndedAtIsNullOrderByIdDesc(projectId, userId)
                    .ifPresent(session -> {
                        Preview runner = previewRepository.findById(session.getPreview().getId()).orElseThrow();
                        sessionRepository.end(session.getId(), reason, Instant.now());
                        shutDownIfUnused(runner, reason);
                    });
        }
    }

    public void shutDownIfUnused(Preview runner, String reason) {
        if (sessionRepository.countByPreviewIdAndEndedAtIsNull(runner.getId()) == 0) {
            lifecycle.terminate(runner, reason);
        }
    }

    /**
     * Reinstalls and restarts a running preview's dev server on behalf of the service itself - the synchronizer,
     * once it has found package.json is no longer the one that was installed. Re-reads the row under the project's
     * lock, so a preview stopped or already restarting in the meantime is left alone.
     */
    public void restartRunner(Long projectId, Long previewId, String detail) {
        synchronized (lockFor(projectId)) {
            previewRepository.findById(previewId)
                    .filter(runner -> runner.getStatus() == PreviewStatus.RUNNING)
                    .ifPresent(runner -> bounce(projectId, runner, detail));
        }
    }

    public Object lockFor(Long projectId) {
        return projectLocks.computeIfAbsent(projectId, id -> new Object());
    }

    private Object userLockFor(Long userId) {
        return userLocks.computeIfAbsent(userId, id -> new Object());
    }

    private boolean bounce(Long projectId, Preview runner, String detail) {
        if (previewRepository.markRestarting(runner.getId(), detail, Instant.now()) == 0) return false;
        router.remove(runner.getHostname());
        bootstrapper.stopDevServer(runner.getPodName());
        bootstrapper.start(runner.getId(), projectId);
        return true;
    }

    private Optional<Preview> activeRunner(Long projectId) {
        Optional<Preview> runner = previewRepository.findFirstByProjectIdAndStatusInOrderByIdDesc(projectId, ACTIVE);
        if (runner.isPresent() && runner.get().getPodName() != null && !runnerPool.isAlive(runner.get().getPodName())) {
            lifecycle.terminate(runner.get(), RUNNER_GONE);
            return Optional.empty();
        }
        return runner;
    }

    /**
     * Ends a running preview whose pod has gone, the moment its owner asks about it. The reaper finds the same
     * thing, but only on its next sweep - up to a minute in which the tab showed a preview as running over a page
     * that could only say it was restarting. The cluster not answering is not evidence the pod is gone.
     */
    private boolean endIfRunnerGone(Long projectId, Preview runner) {
        try {
            if (runnerPool.isAlive(runner.getPodName())) return false;
        } catch (ExternalServiceException e) {
            return false;
        }
        synchronized (lockFor(projectId)) {
            lifecycle.terminate(runner, RUNNER_GONE);
        }
        return true;
    }

    private Preview startRunner(Long projectId, Long userId) {
        Project project = projectRepository.findById(projectId)
                .filter(p -> p.getDeletedAt() == null)
                .orElseThrow(() -> new ResourceNotFoundException("Project", projectId.toString()));

        Instant now = Instant.now();
        boolean othersWaiting = previewRepository.countWaitingAhead(Long.MAX_VALUE, now.minus(WAITER_FRESHNESS)) > 0;
        String podName = othersWaiting ? null
                : runnerPool.claim(projectId).map(pod -> pod.getMetadata().getName()).orElse(null);

        String hostname = previewRepository.findLatestHostname(projectId).orElseGet(() -> newHostname(projectId));
        Preview runner = previewRepository.save(Preview.builder()
                .project(project)
                .namespace(properties.namespace())
                .podName(podName)
                .hostname(hostname)
                .previewUrl(properties.urlFor(hostname))
                .startedByUserId(userId)
                .status(PreviewStatus.CREATING)
                .detail(podName == null ? WAITING_FOR_RUNNER : STARTING_RUNNER)
                .startedAt(now)
                .lastAccessedAt(now)
                .bootstrapHeartbeatAt(now)
                .build());

        if (podName == null) {
            log.info("Preview {} for project {} is waiting in line for a runner", runner.getId(), projectId);
        } else {
            log.info("Starting preview {} for project {} in pod {}", runner.getId(), projectId, podName);
        }
        bootstrapper.start(runner.getId(), projectId);
        return runner;
    }

    private void assertWithinPreviewAllowance(Long userId) {
        PlanDto plan = accountServiceClient.getPlanLimits(userId);
        int allowance = plan.maxPreviews();
        int open = countActivePreviews(userId);
        if (open < allowance) return;

        String planName = plan.name();
        throw new QuotaExceededException(
                "Your " + planName + " plan runs " + allowance + " live " + (allowance == 1 ? "preview" : "previews")
                        + " at a time. Stop one, or upgrade to run more.",
                QuotaExceededException.Reason.PREVIEW_LIMIT, allowance, open, null, planName);
    }

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
                if (!router.refresh(runner.getHostname())) {
                    republishRoute(runner);
                }
            } catch (ExternalServiceException e) {
                log.warn("Couldn't refresh the route for preview {}: {}", runner.getId(), e.getMessage());
            }
        }
    }

    public void republishRoute(Preview runner) {
        Optional<String> podIp = runnerPool.podIp(runner.getPodName());
        if (podIp.isEmpty()) {
            lifecycle.terminate(runner, RUNNER_GONE);
            return;
        }
        router.register(runner.getHostname(), podIp.get());
        log.info("Re-registered the lost route for preview {} on {}", runner.getId(), runner.getHostname());
    }

    private PreviewResponse toResponse(Preview runner, PreviewSession session, String projectName) {
        boolean open = session.getEndedAt() == null;
        boolean failed = Boolean.TRUE.equals(session.getFailed());
        PreviewStatus status = open ? runner.getStatus() : failed ? PreviewStatus.FAILED : PreviewStatus.TERMINATED;
        boolean running = open && runner.getStatus() == PreviewStatus.RUNNING;
        boolean waiting = open && runner.getStatus() == PreviewStatus.CREATING && runner.getPodName() == null;
        Instant stopsAt = running && session.getLastSeenAt() != null
                ? session.getLastSeenAt().plus(properties.idleTimeout())
                : null;
        boolean updating = running && (runner.getSyncDetail() != null || !Objects.equals(
                projectRepository.findCurrentFileRevisionId(session.getProjectId()).orElse(null), runner.getSyncedRevisionId()));
        return new PreviewResponse(
                session.getId(),
                session.getProjectId(),
                projectName,
                status,
                withAccessToken(runner),
                open ? runner.getDetail() : session.getEndReason(),
                open ? runner.getStartedAt() : session.getStartedAt(),
                open ? runner.getReadyAt() : null,
                open ? null : session.getEndedAt(),
                stopsAt,
                open,
                !open && failed ? runner.getFailureKind() : null,
                waiting ? previewRepository.countWaitingAhead(runner.getId(), Instant.now().minus(WAITER_FRESHNESS)) + 1 : null,
                running ? (updating ? PreviewSyncState.UPDATING : PreviewSyncState.UP_TO_DATE) : null,
                updating ? Optional.ofNullable(runner.getSyncDetail()).orElse(PreviewSynchronizer.APPLYING) : null,
                running ? runner.getSyncedRevisionId() : null);
    }

    /**
     * Appends a fresh, short-lived access token to the preview's URL - see PreviewAccessToken. Minted fresh on
     * every response rather than once at preview start, since toResponse only ever runs for a caller who just
     * passed a canView/EditProject check, and a longer-lived token handed out once would outlive that check.
     */
    private String withAccessToken(Preview runner) {
        String token = PreviewAccessToken.mint(
                properties.accessTokenSecret(), runner.getHostname(), Instant.now(), properties.accessTokenTtl());
        return runner.getPreviewUrl() + "?pvt=" + token;
    }

    private String newHostname(Long projectId) {
        StringBuilder slug = new StringBuilder("p").append(projectId).append('-');
        for (int i = 0; i < 10; i++) {
            slug.append(SLUG_ALPHABET.charAt(RANDOM.nextInt(SLUG_ALPHABET.length())));
        }
        return slug + "." + properties.publicDomain();
    }
}
