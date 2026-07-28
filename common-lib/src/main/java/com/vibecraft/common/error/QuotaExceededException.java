package com.vibecraft.common.error;

import lombok.Getter;

import java.time.Instant;

/**
 * An action would take the user past what their plan allows.
 *
 * <p>Handles: a 402 Payment Required carrying the quota numbers, for the three limits this platform enforces - the
 * daily token allowance, the project count and concurrent previews. Deliberately not a BadRequestException, so a
 * client can show an upgrade prompt rather than a generic error.
 *
 * <p>The limit is always account-service's; the thing being counted belongs to whichever service throws this.
 */
@Getter
public class QuotaExceededException extends RuntimeException {

    public enum Reason {
        DAILY_TOKENS,
        PROJECT_LIMIT,
        PREVIEW_LIMIT
    }

    private final Reason reason;
    private final int limit;
    private final int used;
    private final Instant resetsAt;
    private final String planName;

    public QuotaExceededException(String message, Reason reason, int limit, int used, Instant resetsAt, String planName) {
        super(message);
        this.reason = reason;
        this.limit = limit;
        this.used = used;
        this.resetsAt = resetsAt;
        this.planName = planName;
    }

    public QuotaDetails toDetails() {
        return new QuotaDetails(reason.name(), limit, used, resetsAt, planName);
    }
}
