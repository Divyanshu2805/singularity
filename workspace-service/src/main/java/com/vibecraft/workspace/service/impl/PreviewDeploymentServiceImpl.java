package com.vibecraft.workspace.service.impl;

import com.vibecraft.common.dto.PlanDto;
import com.vibecraft.workspace.config.PreviewProperties;
import com.vibecraft.workspace.dto.deploy.PreviewLogsResponse;
import com.vibecraft.workspace.dto.deploy.PreviewResponse;
import com.vibecraft.workspace.entity.Preview;
import com.vibecraft.workspace.entity.PreviewSession;
import com.vibecraft.workspace.entity.Project;
import com.vibecraft.workspace.enums.PreviewStatus;
import com.vibecraft.common.error.CapacityUnavailableException;
import com.vibecraft.common.error.ExternalServiceException;
import com.vibecraft.common.error.QuotaExceededException;
import com.vibecraft.common.error.ResourceNotFoundException;
import com.vibecraft.common.feign.AccountServiceClient;
import com.vibecraft.workspace.repository.PreviewRepository;
import com.vibecraft.workspace.repository.PreviewSessionRepository;
import com.vibecraft.workspace.repository.ProjectRepository;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.workspace.service.PreviewDeploymentService;
import com.vibecraft.workspace.util.PreviewAccessToken;
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
 * Live previews on the Kubernetes runner pool - the entry point the other preview classes hang off.
 *
 * <p>Handles: opening a preview for the caller (joining an existing runner or claiming a pod and starting one),
 * enforcing the plan's concurrent-preview allowance, recording visits that keep a preview alive, restarting the dev
 * server in place, closing a session and shutting the runner down once nobody has it open, reading the runner's
 * output, listing the caller's open previews, and re-publishing a route Redis has lost.
 *
 * <p>Runner per project, session per person. The preview row is the runner: collaborators share it, since they edit
 * the same files. Everything a person sees and does goes through their own session - the tab shows a preview as
 * running only while they have one open, Stop ends only theirs, and the plan allowance counts only theirs. Joining a
 * runner a collaborator already started is instant, with no second install.
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
                markVisited(runner, session);
            }
            return toResponse(runner, session, null);
        });
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
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
                if (previewRepository.markRestarting(runner.getId(), "Restarting the dev server", Instant.now()) == 0) {
                    return startPreview(projectId);
                }

                router.remove(runner.getHostname());
                bootstrapper.stopDevServer(runner.getPodName());
                bootstrapper.start(runner.getId(), projectId, false);
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

    public Object lockFor(Long projectId) {
        return projectLocks.computeIfAbsent(projectId, id -> new Object());
    }

    private Object userLockFor(Long userId) {
        return userLocks.computeIfAbsent(userId, id -> new Object());
    }

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
            lifecycle.terminate(runner, "The preview's runner stopped unexpectedly");
            return;
        }
        router.register(runner.getHostname(), podIp.get());
        log.info("Re-registered the lost route for preview {} on {}", runner.getId(), runner.getHostname());
    }

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
                withAccessToken(runner),
                open ? runner.getDetail() : session.getEndReason(),
                open ? runner.getStartedAt() : session.getStartedAt(),
                open ? runner.getReadyAt() : null,
                open ? null : session.getEndedAt(),
                stopsAt,
                open);
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
