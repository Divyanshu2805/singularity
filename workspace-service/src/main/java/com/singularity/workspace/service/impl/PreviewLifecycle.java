package com.singularity.workspace.service.impl;

import com.singularity.workspace.entity.Preview;
import com.singularity.common.error.ExternalServiceException;
import com.singularity.workspace.enums.PreviewFailureKind;
import com.singularity.workspace.repository.PreviewRepository;
import com.singularity.workspace.repository.PreviewSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Ending a preview's runner, the one way.
 *
 * <p>Handles: flipping the status first and, only if that flip actually happened, ending every session on it, taking
 * down its route and releasing its pod. Shared by Stop, by a start that failed, and by the reaper. A failure is
 * recorded with its kind - the project's install, its dev server, a timeout, no free runner, or the platform - which
 * is what the browser reads to decide whether trying again by itself could help.
 *
 * <p>Cleanup failures are logged rather than thrown: the row already says the preview is over, a leftover route
 * expires on its own, and a leftover pod is deleted by the reaper's orphan sweep - so an unreachable cluster at this
 * moment cannot strand anything for good. A failure keeps the tail of the runner's output on the row, because the pod
 * is gone by the time anyone reads it. A preview that was still waiting in line has no pod and no route to clean up.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class PreviewLifecycle {

    static final int MAX_FAILURE_LOG_CHARS = 8_000;

    private final PreviewRepository previewRepository;
    private final PreviewSessionRepository sessionRepository;
    private final PreviewRouter router;
    private final PreviewRunnerPool runnerPool;

    public boolean terminate(Preview preview, String reason) {
        if (previewRepository.markTerminated(preview.getId(), reason, Instant.now()) == 0) {
            return false;
        }
        log.info("Preview {} on {} stopped: {}", preview.getId(), preview.getHostname(), reason);
        sessionRepository.endAllForPreview(preview.getId(), reason, false, Instant.now());
        cleanUp(preview);
        return true;
    }

    public void fail(Preview preview, PreviewFailureKind kind, String detail, String failureLog) {
        if (previewRepository.markFailed(preview.getId(), kind, detail, tail(failureLog), Instant.now()) == 0) {
            return;
        }
        log.warn("Preview {} on {} failed to start ({}): {}", preview.getId(), preview.getHostname(), kind, detail);
        sessionRepository.endAllForPreview(preview.getId(), detail, true, Instant.now());
        cleanUp(preview);
    }

    private void cleanUp(Preview preview) {
        try {
            router.remove(preview.getHostname());
        } catch (ExternalServiceException e) {
            log.warn("Couldn't remove the route for preview {}; it expires on its own: {}", preview.getId(), e.getMessage());
        }
        try {
            runnerPool.release(preview.getPodName());
        } catch (ExternalServiceException e) {
            log.warn("Couldn't release pod {} for preview {}; the reaper will retry: {}",
                    preview.getPodName(), preview.getId(), e.getMessage());
        }
    }

    static String tail(String text) {
        if (text == null || text.isBlank()) return null;
        String trimmed = text.strip();
        return trimmed.length() <= MAX_FAILURE_LOG_CHARS ? trimmed
                : "..." + trimmed.substring(trimmed.length() - MAX_FAILURE_LOG_CHARS);
    }

}
