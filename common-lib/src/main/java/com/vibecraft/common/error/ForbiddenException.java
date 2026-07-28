package com.vibecraft.common.error;

/**
 * The caller is signed in but not allowed to do this.
 *
 * <p>Handles: a 403 with the thrower's own message - distinct from not being signed in at all, which is a 401.
 */
public class ForbiddenException extends RuntimeException {
    public ForbiddenException(String message) {
        super(message);
    }
}
