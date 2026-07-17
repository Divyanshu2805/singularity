package com.vibecraft.account.dto.subscription;

import java.time.Instant;

/**
 * What the caller is subscribed to right now. Never null-plan: someone who has never paid gets the free plan
 * back with {@code isFree} true, so no client has to treat "no subscription" as a special case.
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
