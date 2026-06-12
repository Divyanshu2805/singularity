package com.java.vibecraft.service.impl;

import com.java.vibecraft.entity.Preview;
import com.java.vibecraft.error.ExternalServiceException;
import com.java.vibecraft.repository.PreviewRepository;
import com.java.vibecraft.repository.PreviewSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Ending a preview's runner, the one way: flip its status first, and only if that flip actually happened, take down its route
 * and release its pod. Shared by the service (Stop), the bootstrapper (a start that failed) and the reaper (idle).
 *
 * <p>Cleanup failures are logged, not thrown. The row already says the preview is over, a leftover route expires on
 * its own ({@code preview.route-ttl}), and a leftover pod is deleted by the reaper's orphan sweep - so an unreachable
 * cluster at this moment can't strand anything for good.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class PreviewLifecycle {

    /** Kept on the row so a failure is readable after the pod is gone; long enough for a useful npm error. */
    static final int MAX_FAILURE_LOG_CHARS = 8_000;

    private final PreviewRepository previewRepository;
    private final PreviewSessionRepository sessionRepository;
    private final PreviewRouter router;
    private final PreviewRunnerPool runnerPool;

    /** Stops a CREATING or RUNNING preview. Returns false if it had already ended. */
    public boolean terminate(Preview preview, String reason) {
        if (previewRepository.markTerminated(preview.getId(), reason, Instant.now()) == 0) {
            return false;
        }
        log.info("Preview {} on {} stopped: {}", preview.getId(), preview.getHostname(), reason);
        // A runner that has ended leaves nobody with a preview open on it.
        sessionRepository.endAllForPreview(preview.getId(), reason, false, Instant.now());
        cleanUp(preview);
        return true;
    }

    /** Fails a preview that was still starting. A no-op if it was stopped in the meantime - Stop already cleaned up. */
    public void fail(Preview preview, String detail, String failureLog) {
        if (previewRepository.markFailed(preview.getId(), detail, tail(failureLog), Instant.now()) == 0) {
            return;
        }
        log.warn("Preview {} on {} failed to start: {}", preview.getId(), preview.getHostname(), detail);
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
