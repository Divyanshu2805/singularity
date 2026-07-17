package com.vibecraft.common.error;

/** The caller is authenticated but not allowed to do this (403) — distinct from not being signed in at all (401). */
public class ForbiddenException extends RuntimeException {
    public ForbiddenException(String message) {
        super(message);
    }
}
