package com.vibecraft.account.enums;

/**
 * The states a subscription can be in, mirroring Stripe's own vocabulary.
 *
 * <p>Handles: naming them. Which of these still entitle a user to their plan is decided in one place,
 * SubscriptionServiceImpl.
 */
public enum SubscriptionStatus {
    ACTIVE, TRIALING, CANCELED, PAST_DUE, INCOMPLETE
}
