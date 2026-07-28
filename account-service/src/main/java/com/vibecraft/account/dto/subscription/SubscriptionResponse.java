package com.vibecraft.account.dto.subscription;

import java.time.Instant;

/**
 * What the caller is subscribed to right now.
 *
 * <p>Handles: the plan, the subscription status, the current period's start and end, and whether it is set to stop at
 * the end of that period - still active until then.
 *
 * <p>Never null-plan: someone who has never paid gets the free plan back with isFree true, so no client has to treat
 * "no subscription" as a special case.
 */
public record SubscriptionResponse(
        PlanResponse plan,
        String status,
        Instant periodStart,
        Instant periodEnd,
        Boolean cancelAtPeriodEnd,
        boolean isFree
) {
}
