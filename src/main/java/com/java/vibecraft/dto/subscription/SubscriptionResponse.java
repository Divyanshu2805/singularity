package com.java.vibecraft.dto.subscription;

import java.time.Instant;

/**
 * What the caller is subscribed to right now. Never null-plan: someone who has never paid gets the free plan
 * back with {@code isFree} true, so no client has to treat "no subscription" as a special case.
 *
 * <p>Usage deliberately isn't here - it lives on {@code GET /api/usage/today}, which is the one place that
 * answers "how much is left". A {@code tokensUsedThisCycle} field used to sit on this record and was
 * <em>always null</em>: nothing on {@code Subscription} could supply it, so MapStruct quietly generated
 * {@code tokensUsedThisCycle = null} and no caller ever saw a number. The quota is daily, not per billing
 * cycle, so the field was measuring the wrong period anyway.
 */
public record SubscriptionResponse(
        PlanResponse plan,
        /** A {@code SubscriptionStatus} name, or null on the free plan - nothing was ever subscribed. */
        String status,
        Instant periodStart,
        /** When the current paid period runs out: the renewal date, or the end date once cancelled. */
        Instant periodEnd,
        /** True once cancelled through the portal: still active until {@code periodEnd}, then it stops. */
        Boolean cancelAtPeriodEnd,
        boolean isFree
) {
}
