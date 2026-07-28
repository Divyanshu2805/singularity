package com.vibecraft.common.error;

import lombok.Getter;

/**
 * The caller tripped a rate limit.
 *
 * <p>Handles: a 429 carrying how many seconds until the next attempt could succeed, which GlobalExceptionHandler puts
 * on the Retry-After header.
 */
@Getter
public class RateLimitExceededException extends RuntimeException {

    private final long retryAfterSeconds;

    public RateLimitExceededException(long retryAfterSeconds) {
        super("Too many requests. Please wait " + retryAfterSeconds + "s and try again.");
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
