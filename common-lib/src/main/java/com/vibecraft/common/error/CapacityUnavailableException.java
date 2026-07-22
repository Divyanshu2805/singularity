package com.vibecraft.common.error;

/**
 * Nothing is wrong with the request; the platform just has no room for it right now (every preview runner is busy).
 * A 503, because "try again shortly" is exactly the right response - which a 409 or 400 wouldn't say.
 *
 * <p>Lives here rather than in workspace-service (where it is thrown today) because it is a generic
 * capacity-exhaustion concept any service could reuse, same shape as {@link RateLimitExceededException}/
 * {@link QuotaExceededException} - and so that {@code GlobalExceptionHandler} can map it for every service.
 */
public class CapacityUnavailableException extends RuntimeException {

    public CapacityUnavailableException(String message) {
        super(message);
    }
}
