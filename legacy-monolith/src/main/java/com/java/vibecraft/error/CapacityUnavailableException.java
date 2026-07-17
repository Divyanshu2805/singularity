package com.java.vibecraft.error;

/**
 * Nothing is wrong with the request; the platform just has no room for it right now (every preview runner is busy).
 * A 503, because "try again shortly" is exactly the right response - which a 409 or 400 wouldn't say.
 */
public class CapacityUnavailableException extends RuntimeException {

    public CapacityUnavailableException(String message) {
        super(message);
    }
}
