package com.vibecraft.common.error;

/**
 * The request is well formed but conflicts with the current state of the resource.
 *
 * <p>Handles: a 409 with the thrower's own message. Mapped by GlobalExceptionHandler.
 */
public class ConflictException extends RuntimeException {
    public ConflictException(String message) {
        super(message);
    }
}
