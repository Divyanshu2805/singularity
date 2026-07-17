package com.java.vibecraft.error;

import lombok.Getter;

import java.time.Instant;

/**
 * Raised when an action would take a user past what their plan allows.
 *
 * <p>Deliberately its own type rather than a {@link BadRequestException}: running out of quota is not a
 * malformed request, and the client needs to tell the two apart to show an upgrade prompt instead of an
 * error. It maps to <b>402 Payment Required</b> - the one status that says "this would work if you paid".
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
