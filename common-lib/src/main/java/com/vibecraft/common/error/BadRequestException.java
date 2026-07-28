package com.vibecraft.common.error;

/**
 * The request itself is invalid in a way @Valid field validation does not already cover.
 *
 * <p>Handles: a 400 with the thrower's own message. Mapped by GlobalExceptionHandler.
 */
public class BadRequestException extends RuntimeException {
    public BadRequestException(String message) {
        super(message);
    }
}
