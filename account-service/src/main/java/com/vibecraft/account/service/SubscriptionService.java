package com.vibecraft.account.service;

import com.vibecraft.account.dto.subscription.CheckoutRequest;
import com.vibecraft.account.dto.subscription.CheckoutResponse;
import com.vibecraft.account.dto.subscription.PortalResponse;
import com.vibecraft.account.dto.subscription.SubscriptionResponse;
import com.vibecraft.account.entity.Plan;
import com.vibecraft.account.enums.SubscriptionStatus;

import java.time.Instant;
import java.util.Optional;

/**
 * Note: {@code projectsOwned}/{@code canCreateNewProject} that legacy-monolith's copy of this interface has
 * are deliberately NOT here. Counting owned projects is workspace-service's job (it owns {@code ProjectMember});
 * this service only ever answers "what does this user's plan allow" — {@link #projectAllowance} — and lets the
 * caller do its own counting and comparison. See docs/migration/ for why the boundary was redrawn here
 * rather than carried over as-is.
 */
public interface SubscriptionService {

    /**
     * What someone gets before they ever pay. Shared with intelligence-service's usage checks and written
     * into the free plan row by {@code PlanSeeder}, so enforcement and the pricing page can't disagree.
     */
    int FREE_TIER_PROJECTS_ALLOWED = 1;
    int FREE_TIER_DAILY_TOKENS = 5_000;

    /** How many live previews a free-tier user may run at once. */
    int FREE_TIER_PREVIEWS = 1;

    SubscriptionResponse getCurrentSubscription();

    void activateSubscription(Long userId, Long planId, String subscriptionId, String customerId);

    void updateSubscription(String gatewaySubscriptionId, SubscriptionStatus status, Instant periodStart, Instant periodEnd, Boolean cancelAtPeriodEnd, Long planId);

    void cancelSubscription(String gatewaySubscriptionId);

    void renewSubscriptionPeriod(String gatewaySubscriptionId, Instant periodStart, Instant periodEnd);

    void markSubscriptionPastDue(String gatewaySubscriptionId);

    /**
     * The plan a user is entitled to right now, or null if they're on the free tier. One place that decides
     * which subscription statuses still count.
     */
    Plan getActivePlan(Long userId);

    /** The subscription that currently entitles this user to a paid plan, if any - same status rule as above. */
    Optional<com.vibecraft.account.entity.Subscription> getActiveSubscription(Long userId);

    /** How many projects this user may own, from their plan or the free constant. */
    int projectAllowance(Long userId);

    /** How many live previews this user may run at once, from their plan or the free constant. */
    int previewAllowance(Long userId);
}
