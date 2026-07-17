package com.vibecraft.common.error;

/**
 * A third party this request depends on (Firebase, Stripe, OpenRouter, another internal service via Feign)
 * failed or was unreachable — not the caller's fault, so a 502 rather than a 400.
 */
public class ExternalServiceException extends RuntimeException {
    public ExternalServiceException(String message, Throwable cause) {
        super(message, cause);
    }
}
