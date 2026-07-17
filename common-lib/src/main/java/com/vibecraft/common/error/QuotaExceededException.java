package com.vibecraft.common.error;

/**
 * A plan-enforced limit was hit (402) — daily AI tokens, project count, or concurrent previews, depending
 * on {@link #reason()}. The limit is always Account's; the thing being counted belongs to whichever
 * service throws this.
 */
public class QuotaExceededException extends RuntimeException {

    public enum Reason {
        DAILY_TOKENS,
        PROJECT_LIMIT,
        PREVIEW_LIMIT
    }

    private final Reason reason;
    private final long limit;
    private final long used;

    public QuotaExceededException(String message, Reason reason, long limit, long used) {
        super(message);
        this.reason = reason;
        this.limit = limit;
        this.used = used;
    }

    public Reason reason() {
        return reason;
    }

    public long limit() {
        return limit;
    }

    public long used() {
        return used;
    }
}
