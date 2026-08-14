package com.vibecraft.account.enums;

/**
 * The states a subscription can be in, mirroring Stripe's own vocabulary.
 *
 * <p>Handles: naming them. Which of these still entitle a user to their plan is decided in one place,
 * SubscriptionServiceImpl - PAST_DUE only within a finite grace window of when it started, everything else is a
 * flat yes (ACTIVE, TRIALING) or no (CANCELED, INCOMPLETE, UNPAID, PAUSED).
 *
 * <p>UNPAID and PAUSED are deliberately distinct from PAST_DUE: Stripe's "unpaid" and "paused" are dunning-exhausted
 * or deliberately-suspended states with no further recovery expected, not a delinquency still worth a grace period.
 * "incomplete_expired" maps to CANCELED instead of either - that checkout never completed, so there was never
 * anything to be delinquent on.
 */
public enum SubscriptionStatus {
    ACTIVE, TRIALING, CANCELED, PAST_DUE, INCOMPLETE, UNPAID, PAUSED
}
