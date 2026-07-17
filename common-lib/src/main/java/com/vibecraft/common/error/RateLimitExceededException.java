package com.vibecraft.common.error;

import lombok.Getter;

/** The caller tripped a sliding-window rate limit (429) — carries how long until the next attempt may succeed. */
@Getter
public class RateLimitExceededException extends RuntimeException {

    private final long retryAfterSeconds;

    public RateLimitExceededException(long retryAfterSeconds) {
        super("Too many requests. Please wait " + retryAfterSeconds + "s and try again.");
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
