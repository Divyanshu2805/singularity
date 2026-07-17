package com.vibecraft.common.error;

/** The request itself is invalid in a way that isn't already covered by {@code @Valid} field validation. */
public class BadRequestException extends RuntimeException {
    public BadRequestException(String message) {
        super(message);
    }
}
