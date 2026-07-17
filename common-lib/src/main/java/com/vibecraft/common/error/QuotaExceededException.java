package com.vibecraft.common.error;

import lombok.Getter;

import java.time.Instant;

/**
 * Raised when an action would take a user past what their plan allows (402 Payment Required — not a
 * {@link BadRequestException}, so a client can show an upgrade prompt instead of a generic error). The
 * limit is always Account's; the thing being counted belongs to whichever service throws this.
 */
@Getter
public class QuotaExceededException extends RuntimeException {

    public enum Reason {
        /** The daily token allowance is spent. Refills at local midnight. */
        DAILY_TOKENS,
        /** They already own as many projects as the plan permits. Only upgrading or deleting one helps. */
        PROJECT_LIMIT,
        /** As many live previews are running as the plan permits. Stopping one frees a slot straight away. */
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
