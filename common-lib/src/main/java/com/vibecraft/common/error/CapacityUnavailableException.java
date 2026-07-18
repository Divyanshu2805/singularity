package com.vibecraft.common.error;

/**
 * Nothing is wrong with the request; the platform just has no room for it right now (every preview runner is busy).
 * A 503, because "try again shortly" is exactly the right response - which a 409 or 400 wouldn't say.
 *
 * <p>Moved here from legacy-monolith's local {@code error} package during workspace-service's extraction
 * (docs/migration/phase-2-workspace-service.md's Phase 2 entry) - a generic capacity-exhaustion concept any service could reuse, same
 * shape as {@link RateLimitExceededException}/{@link QuotaExceededException} already living here despite being
 * introduced by one domain first. legacy-monolith keeps its own separate copy untouched (not cut over).
 */
public class CapacityUnavailableException extends RuntimeException {

    public CapacityUnavailableException(String message) {
        super(message);
    }
}
