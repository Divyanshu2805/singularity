package com.vibecraft.common.error;

/** The caller tripped a sliding-window rate limit (429). */
public class RateLimitExceededException extends RuntimeException {
    public RateLimitExceededException(String message) {
        super(message);
    }
}
