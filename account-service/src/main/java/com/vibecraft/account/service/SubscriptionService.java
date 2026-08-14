package com.vibecraft.account.service;

import com.vibecraft.account.dto.subscription.CheckoutRequest;
import com.vibecraft.account.dto.subscription.CheckoutResponse;
import com.vibecraft.account.dto.subscription.PortalResponse;
import com.vibecraft.account.dto.subscription.SubscriptionResponse;
import com.vibecraft.account.entity.Plan;
import com.vibecraft.account.entity.Subscription;
import com.vibecraft.account.enums.SubscriptionStatus;

import java.time.Instant;
import java.util.Optional;

/**
 * What a user is entitled to, and the subscription state behind it.
 *
 * <p>Handles: reading the caller's current subscription (never null-plan - someone who has never paid gets the free
 * plan back), resolving the plan a user is entitled to right now, and the state transitions the Stripe webhooks
 * drive: activation, update, cancellation, renewal and past-due. It also holds the free-tier constants, which
 * PlanSeeder writes into the free plan row so enforcement and the pricing page cannot disagree.
 *
 * <p>Counting owned projects is deliberately not here: that is workspace-service's table. This service only ever
 * answers what a plan allows, and the caller does its own counting.
 *
 * <p>Every state-changing method takes an {@code eventTime}: the Stripe webhook's own event-creation timestamp, or
 * {@code null} for a caller that isn't racing other events (a fresh live re-read from Stripe, or the row's own
 * creation). It is compared against the row's last-applied event time so a delayed or redelivered-out-of-order
 * webhook cannot overwrite newer state with older state - see SubscriptionServiceImpl's class Javadoc.
 */
public interface SubscriptionService {

    int FREE_TIER_PROJECTS_ALLOWED = 1;
    int FREE_TIER_DAILY_TOKENS = 5_000;

    int FREE_TIER_PREVIEWS = 1;

    SubscriptionResponse getCurrentSubscription();

    void activateSubscription(Long userId, Long planId, String subscriptionId, String customerId, Instant eventTime);

    void updateSubscription(String gatewaySubscriptionId, SubscriptionStatus status, Instant periodStart, Instant periodEnd, Boolean cancelAtPeriodEnd, Long planId, Instant eventTime);

    void cancelSubscription(String gatewaySubscriptionId, Instant eventTime);

    void renewSubscriptionPeriod(String gatewaySubscriptionId, Instant periodStart, Instant periodEnd, Instant eventTime);

    void markSubscriptionPastDue(String gatewaySubscriptionId, Instant eventTime);

    /** Records that a plan-change's Stripe write succeeded but the immediate re-read back from Stripe failed. */
    void markSyncPending(String gatewaySubscriptionId);

    Plan getActivePlan(Long userId);

    Optional<Subscription> getActiveSubscription(Long userId);
}
