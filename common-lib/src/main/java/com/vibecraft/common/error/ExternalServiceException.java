package com.vibecraft.common.error;

/**
 * A third party this request depends on (Firebase, Stripe, OpenRouter, another internal service via Feign, the
 * Kubernetes cluster) failed or was unreachable — not the caller's fault, so a 503 rather than a 4xx. The client sees
 * a generic message and {@code code: UPSTREAM_UNAVAILABLE}; this exception's own message and cause go to the log only.
 */
public class ExternalServiceException extends RuntimeException {
    public ExternalServiceException(String message, Throwable cause) {
        super(message, cause);
    }
}
