package com.vibecraft.common.error;

/**
 * Nothing is wrong with the request; the platform simply has no room for it right now.
 *
 * <p>Handles: a 503 tagged CAPACITY_UNAVAILABLE that keeps its own message, because "try again shortly" is exactly
 * the right response and a 409 or 400 would not say it. Thrown today when every preview runner is claimed.
 *
 * <p>Lives in common-lib rather than workspace-service because it is a generic capacity concept, and so
 * GlobalExceptionHandler can map it for every service.
 */
public class CapacityUnavailableException extends RuntimeException {

    public CapacityUnavailableException(String message) {
        super(message);
    }
}
