package com.vibecraft.common.error;

/** The request is well-formed but conflicts with the current state of the resource (409). */
public class ConflictException extends RuntimeException {
    public ConflictException(String message) {
        super(message);
    }
}
