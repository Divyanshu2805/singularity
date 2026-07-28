package com.vibecraft.common.error;

/**
 * Something this request depends on failed or was unreachable - Firebase, Stripe, OpenRouter, another service over
 * Feign, or the Kubernetes cluster.
 *
 * <p>Handles: a 503 tagged UPSTREAM_UNAVAILABLE. Not the caller's fault, so not a 4xx. The client sees a generic
 * sentence; this exception's own message and cause go to the log only, so an internal address or bucket name is never
 * echoed back.
 */
public class ExternalServiceException extends RuntimeException {
    public ExternalServiceException(String message, Throwable cause) {
        super(message, cause);
    }
}
