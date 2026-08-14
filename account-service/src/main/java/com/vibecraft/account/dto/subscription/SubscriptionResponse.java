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
 *
 * <p>syncPending is true when a plan-change's write to Stripe succeeded but the immediate read-back failed - the
 * fields above may still be the pre-change state. A 200 here is not proof the change is fully reflected; the caller
 * should show the change as provisional until a later read comes back with syncPending false.
 */
public record SubscriptionResponse(
        PlanResponse plan,
        String status,
        Instant periodStart,
        Instant periodEnd,
        Boolean cancelAtPeriodEnd,
        boolean isFree,
        boolean syncPending
) {
}
