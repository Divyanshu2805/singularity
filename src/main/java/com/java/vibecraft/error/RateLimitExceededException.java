package com.java.vibecraft.error;

import lombok.Getter;

@Getter
public class RateLimitExceededException extends RuntimeException {

    private final long retryAfterSeconds;

    public RateLimitExceededException(long retryAfterSeconds) {
        super("Too many requests. Please wait " + retryAfterSeconds + "s and try again.");
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
